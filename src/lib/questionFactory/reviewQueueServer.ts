import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProductCategoryMapping } from "@/lib/questionFactory/categoryMappingServer";
import { resolveCurriculumChapter } from "@/lib/questionFactory/curriculumChapterServer";
import { buildProductMappingCandidate, type ProductMappingCandidate } from "@/lib/questionFactory/productMapping";
import { parseQuestionFactoryScopeKey } from "@/lib/questionFactory/scopeKey";
import type { FactoryQuestionCandidate, FactoryTextSlotSpec } from "@/lib/questionFactory/textCandidate";

const STAGING_BUCKET = "question-factory-assets";
const PREVIEW_TTL_SECONDS = 10 * 60;

type SlotRow = {
  id: number;
  run_id: number;
  slot_key: string;
  ordinal: number;
  state: "pending_human_review" | "approved";
  question_id: number | null;
  state_version: number;
  author_revision: number;
  slot_spec: FactoryTextSlotSpec;
  updated_at: string;
};

type RunRow = { id: number; run_key: string; scope_key: string; status: string };
type EventRow = { id: number; slot_id: number | null; payload: Record<string, unknown>; created_at: string };
type AssetRow = {
  id: number;
  slot_id: number;
  asset_revision: number;
  state: string;
  staging_path: string;
  mime_type: string;
  checksum: string;
  build_spec: Record<string, unknown>;
  width: number | null;
  height: number | null;
};

export type FactoryReviewQueueItem = {
  slotId: number;
  slotKey: string;
  ordinal: number;
  state: "pending_human_review" | "approved";
  stateVersion: number;
  runKey: string;
  scopeKey: string;
  runStatus: string;
  queuedAt: string;
  slotSpec: FactoryTextSlotSpec;
  question: FactoryQuestionCandidate;
  asset: null | {
    id: number;
    revision: number;
    checksum: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    signedPreviewUrl: string;
  };
  mappingCandidate: ProductMappingCandidate | null;
  mappingError: string | null;
};

function isQuestionCandidate(value: unknown): value is FactoryQuestionCandidate {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.schemaVersion === "question-candidate/v1" &&
    typeof row.revision === "number" && typeof row.questionText === "string" &&
    Array.isArray(row.choices) && row.choices.length === 4 &&
    row.choices.every((choice) => typeof choice === "string") &&
    Number.isSafeInteger(row.correctIndex) && Number(row.correctIndex) >= 0 && Number(row.correctIndex) < 4 &&
    typeof row.explanation === "string";
}

export async function loadFactoryReviewQueue(): Promise<FactoryReviewQueueItem[]> {
  const admin = createAdminClient();
  const slotsResult = await admin
    .from("question_factory_slots")
    .select("id, run_id, slot_key, ordinal, state, question_id, state_version, author_revision, slot_spec, updated_at")
    .or("state.eq.pending_human_review,and(state.eq.approved,question_id.is.null)")
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (slotsResult.error) throw new Error(`Unable to load Factory review queue: ${slotsResult.error.message}`);
  const slots = (slotsResult.data ?? []) as SlotRow[];
  if (!slots.length) return [];

  const runIds = [...new Set(slots.map((slot) => slot.run_id))];
  const slotIds = slots.map((slot) => slot.id);
  const [runsResult, eventsResult, assetsResult] = await Promise.all([
    admin.from("question_factory_runs").select("id, run_key, scope_key, status").in("id", runIds),
    admin.from("question_factory_events")
      .select("id, slot_id, payload, created_at")
      .in("slot_id", slotIds)
      .in("event_type", ["AUTHOR_COMPLETE", "QUESTION_REVISED"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    admin.from("question_factory_assets")
      .select("id, slot_id, asset_revision, state, staging_path, mime_type, checksum, width, height, build_spec")
      .in("slot_id", slotIds)
      .order("asset_revision", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  if (runsResult.error) throw new Error(`Unable to load Factory review runs: ${runsResult.error.message}`);
  if (eventsResult.error) throw new Error(`Unable to load Factory review candidates: ${eventsResult.error.message}`);
  if (assetsResult.error) throw new Error(`Unable to load Factory review assets: ${assetsResult.error.message}`);

  const runById = new Map(((runsResult.data ?? []) as RunRow[]).map((run) => [run.id, run]));
  const eventBySlot = new Map<number, EventRow>();
  for (const event of (eventsResult.data ?? []) as EventRow[]) {
    if (event.slot_id !== null && !eventBySlot.has(event.slot_id)) eventBySlot.set(event.slot_id, event);
  }
  const assetBySlot = new Map<number, AssetRow>();
  for (const asset of (assetsResult.data ?? []) as AssetRow[]) {
    if (!assetBySlot.has(asset.slot_id)) assetBySlot.set(asset.slot_id, asset);
  }

  return Promise.all(slots.map(async (slot) => {
    const run = runById.get(slot.run_id);
    const event = eventBySlot.get(slot.id);
    const candidate = event?.payload?.candidate;
    if (!run || !isQuestionCandidate(candidate)) {
      throw new Error(`Review queue slot ${slot.slot_key} is missing immutable run/candidate evidence`);
    }
    const asset = assetBySlot.get(slot.id);
    let preview: FactoryReviewQueueItem["asset"] = null;
    if (slot.slot_spec.representationType !== "none") {
      if (!asset || asset.state !== "qc_passed") {
        throw new Error(`Review queue slot ${slot.slot_key} does not reference the latest QC-passed asset`);
      }
      const signed = await admin.storage.from(STAGING_BUCKET)
        .createSignedUrl(asset.staging_path, PREVIEW_TTL_SECONDS);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(`Unable to sign review asset ${slot.slot_key}: ${signed.error?.message ?? "missing URL"}`);
      }
      preview = {
        id: asset.id, revision: asset.asset_revision, checksum: asset.checksum,
        mimeType: asset.mime_type, width: asset.width, height: asset.height,
        signedPreviewUrl: signed.data.signedUrl,
      };
    }
    let mappingCandidate: ProductMappingCandidate | null = null;
    let mappingError: string | null = null;
    try {
      const scope = parseQuestionFactoryScopeKey(run.scope_key);
      const [chapter, categoryMapping] = await Promise.all([
        resolveCurriculumChapter({
          chapterKey: scope.unit, stage: scope.stage, grade: scope.grade, subject: scope.subject,
        }),
        resolveProductCategoryMapping({
          chapterKey: scope.unit, topicId: slot.slot_spec.topic,
          stage: scope.stage, subject: scope.subject,
        }),
      ]);
      mappingCandidate = buildProductMappingCandidate({
        stage: scope.stage, grade: scope.grade, subject: scope.subject,
        slotSpec: slot.slot_spec, question: candidate, chapter, categoryMapping,
        approvedAsset: preview && asset ? {
          assetRevision: asset.asset_revision, checksum: asset.checksum,
          mimeType: asset.mime_type as "image/svg+xml" | "image/webp", buildSpec: asset.build_spec,
        } : null,
      });
    } catch (error) {
      mappingError = error instanceof Error ? error.message : "Unable to resolve Product Mapping Candidate";
    }
    return {
      slotId: slot.id, slotKey: slot.slot_key, ordinal: slot.ordinal, state: slot.state,
      stateVersion: slot.state_version, runKey: run.run_key, scopeKey: run.scope_key,
      runStatus: run.status, queuedAt: slot.updated_at, slotSpec: slot.slot_spec,
      question: candidate, asset: preview, mappingCandidate, mappingError,
    };
  }));
}
