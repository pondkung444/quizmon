import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  projectFactoryOffice,
  type FactoryOfficeInput,
  type FactoryOfficeProjection,
  type QuestionFactoryRunStatus,
  type QuestionFactorySlotState,
} from "@/lib/questionFactory/officeProjection";

const RUN_STATUSES = new Set<QuestionFactoryRunStatus>([
  "created", "running", "paused", "waiting_human_review", "completed", "cancelled", "failed",
]);
const SLOT_STATES = new Set<QuestionFactorySlotState>([
  "planned", "authoring", "question_qc", "author_revision", "asset_build", "asset_qc",
  "pending_human_review", "approved", "active", "rejected", "blocked", "cancelled",
]);
const OPEN_RUN_STATUSES: QuestionFactoryRunStatus[] = ["created", "running", "paused", "waiting_human_review"];

type RunRow = {
  id: number;
  run_key: string;
  scope_key: string;
  status: string;
  target_active: number;
  active_count: number;
  pipeline_ready_count: number;
  updated_at: string;
};

type SlotRow = { id: number; slot_key: string; ordinal: number; state: string; updated_at: string };
type EventRow = { event_type: string; created_at: string };

export type FactoryOfficeLiveSnapshot = {
  source: "live";
  run: {
    id: number;
    runKey: string;
    scopeKey: string;
    status: QuestionFactoryRunStatus;
    targetActive: number;
    activeCount: number;
    pipelineReadyCount: number;
    updatedAt: string;
  };
  focusSlot: {
    id: number;
    slotKey: string;
    ordinal: number;
    state: QuestionFactorySlotState;
    updatedAt: string;
  } | null;
  latestEvent: { type: string; createdAt: string } | null;
  stateCounts: Partial<Record<QuestionFactorySlotState, number>>;
  totalSlots: number;
  projection: FactoryOfficeProjection[];
};

export type FactoryOfficeUnavailableSnapshot = {
  source: "unavailable";
  reason: "not_deployed" | "no_runs" | "query_failed";
};

export type FactoryOfficeServerSnapshot = FactoryOfficeLiveSnapshot | FactoryOfficeUnavailableSnapshot;

function isRunStatus(value: string): value is QuestionFactoryRunStatus {
  return RUN_STATUSES.has(value as QuestionFactoryRunStatus);
}

function isSlotState(value: string): value is QuestionFactorySlotState {
  return SLOT_STATES.has(value as QuestionFactorySlotState);
}

async function latestRun(admin: ReturnType<typeof createAdminClient>): Promise<RunRow | null> {
  const columns = "id, run_key, scope_key, status, target_active, active_count, pipeline_ready_count, updated_at";
  const open = await admin
    .from("question_factory_runs")
    .select(columns)
    .in("status", OPEN_RUN_STATUSES)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open.error) throw open.error;
  if (open.data) return open.data as RunRow;

  const latest = await admin
    .from("question_factory_runs")
    .select(columns)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw latest.error;
  return latest.data as RunRow | null;
}

export async function loadFactoryOfficeSnapshot(): Promise<FactoryOfficeServerSnapshot> {
  const admin = createAdminClient();

  try {
    const run = await latestRun(admin);
    if (!run) return { source: "unavailable", reason: "no_runs" };
    if (!isRunStatus(run.status)) throw new Error(`Unsupported Question Factory run status: ${run.status}`);

    const [focusResult, slotsResult] = await Promise.all([
      admin
        .from("question_factory_slots")
        .select("id, slot_key, ordinal, state, updated_at")
        .eq("run_id", run.id)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("question_factory_slots")
        .select("state")
        .eq("run_id", run.id)
        .order("id", { ascending: true }),
    ]);
    if (focusResult.error) throw focusResult.error;
    if (slotsResult.error) throw slotsResult.error;

    const focus = focusResult.data as SlotRow | null;
    if (focus && !isSlotState(focus.state)) throw new Error(`Unsupported Question Factory slot state: ${focus.state}`);
    const focusState = focus ? focus.state as QuestionFactorySlotState : null;

    let latestEvent: EventRow | null = null;
    if (focus) {
      const eventResult = await admin
        .from("question_factory_events")
        .select("event_type, created_at")
        .eq("run_id", run.id)
        .eq("slot_id", focus.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (eventResult.error) throw eventResult.error;
      latestEvent = eventResult.data as EventRow | null;
    }

    const stateCounts: Partial<Record<QuestionFactorySlotState, number>> = {};
    for (const row of (slotsResult.data ?? []) as Array<{ state: string }>) {
      if (!isSlotState(row.state)) continue;
      stateCounts[row.state] = (stateCounts[row.state] ?? 0) + 1;
    }

    const projectionInput: FactoryOfficeInput = {
      runStatus: run.status,
      slotState: focusState,
      latestEventType: latestEvent?.event_type ?? null,
    };

    return {
      source: "live",
      run: {
        id: run.id,
        runKey: run.run_key,
        scopeKey: run.scope_key,
        status: run.status,
        targetActive: run.target_active,
        activeCount: run.active_count,
        pipelineReadyCount: run.pipeline_ready_count,
        updatedAt: run.updated_at,
      },
      focusSlot: focus ? {
        id: focus.id,
        slotKey: focus.slot_key,
        ordinal: focus.ordinal,
        state: focusState!,
        updatedAt: focus.updated_at,
      } : null,
      latestEvent: latestEvent ? { type: latestEvent.event_type, createdAt: latestEvent.created_at } : null,
      stateCounts,
      totalSlots: (slotsResult.data ?? []).length,
      projection: projectFactoryOffice(projectionInput),
    };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "42P01" || code === "PGRST205") {
      return { source: "unavailable", reason: "not_deployed" };
    }
    console.error("Unable to load Question Factory office snapshot", error);
    return { source: "unavailable", reason: "query_failed" };
  }
}
