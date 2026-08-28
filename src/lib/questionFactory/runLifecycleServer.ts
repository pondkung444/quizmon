import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isQuestionFactoryScopeKey } from "@/lib/questionFactory/scopeKey";

type JsonObject = Record<string, unknown>;

export type FactoryRunSlotInput = {
  slotKey: string;
  ordinal: number;
  slotSpec: JsonObject;
};

export type CreateFactoryRunInput = {
  runKey?: string;
  scopeKey: string;
  createdBy: string;
  profile: { id: string; version: string; schemaVersion: string; resolved: JsonObject };
  blueprint: { id: string; version: string; schemaVersion: string; resolved: JsonObject };
  targetActive: number;
  preferredBatchSize?: number;
  maxBatchSize?: number;
  maxGeneratedItems?: number;
  maxRevisionsPerSlot?: number;
  maxTechnicalRetries?: number;
  slots: FactoryRunSlotInput[];
};

export type CreateFactoryRunResult = {
  runId: number;
  runKey: string;
  status: "created" | "running" | "paused" | "waiting_human_review" | "completed" | "cancelled" | "failed";
  replayed: boolean;
};

export type StartFactoryRunResult = {
  runId: number;
  runKey: string;
  status: "running";
  stateVersion: number;
  replayed: boolean;
};

const RUN_STATUSES = new Set<CreateFactoryRunResult["status"]>([
  "created", "running", "paused", "waiting_human_review", "completed", "cancelled", "failed",
]);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(value: JsonObject): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function validateInput(input: CreateFactoryRunInput): void {
  if (!isQuestionFactoryScopeKey(input.scopeKey)) throw new Error("Invalid Question Factory scope key");
  if (!input.createdBy.trim()) throw new Error("createdBy is required");
  positiveInteger(input.targetActive, "targetActive");
  if (input.slots.length !== input.targetActive) throw new Error("Slot count must equal targetActive");

  const keys = new Set<string>();
  const ordinals = new Set<number>();
  for (const slot of input.slots) {
    if (!slot.slotKey.trim()) throw new Error("Every slot requires a slotKey");
    positiveInteger(slot.ordinal, "slot ordinal");
    if (keys.has(slot.slotKey) || ordinals.has(slot.ordinal)) {
      throw new Error("Slot keys and ordinals must be unique within a run");
    }
    keys.add(slot.slotKey);
    ordinals.add(slot.ordinal);
  }
}

export async function createFactoryRun(input: CreateFactoryRunInput): Promise<CreateFactoryRunResult> {
  validateInput(input);
  const runKey = input.runKey ?? randomUUID();
  const profileChecksum = checksum(input.profile.resolved);
  const blueprintChecksum = checksum(input.blueprint.resolved);
  const requestChecksum = checksum({
    scopeKey: input.scopeKey,
    createdBy: input.createdBy,
    profile: { ...input.profile, checksum: profileChecksum },
    blueprint: { ...input.blueprint, checksum: blueprintChecksum },
    targetActive: input.targetActive,
    preferredBatchSize: input.preferredBatchSize ?? 10,
    maxBatchSize: input.maxBatchSize ?? 20,
    maxGeneratedItems: input.maxGeneratedItems ?? Math.max(120, input.targetActive),
    maxRevisionsPerSlot: input.maxRevisionsPerSlot ?? 2,
    maxTechnicalRetries: input.maxTechnicalRetries ?? 3,
    slots: input.slots,
  });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("question_factory_create_run", {
    p_run_key: runKey,
    p_request_checksum: requestChecksum,
    p_scope_key: input.scopeKey,
    p_created_by: input.createdBy,
    p_profile_id: input.profile.id,
    p_profile_version: input.profile.version,
    p_profile_schema_version: input.profile.schemaVersion,
    p_profile_checksum: profileChecksum,
    p_resolved_profile: input.profile.resolved,
    p_blueprint_id: input.blueprint.id,
    p_blueprint_version: input.blueprint.version,
    p_blueprint_schema_version: input.blueprint.schemaVersion,
    p_blueprint_checksum: blueprintChecksum,
    p_resolved_blueprint: input.blueprint.resolved,
    p_target_active: input.targetActive,
    p_preferred_batch_size: input.preferredBatchSize ?? 10,
    p_max_batch_size: input.maxBatchSize ?? 20,
    p_max_generated_items: input.maxGeneratedItems ?? Math.max(120, input.targetActive),
    p_max_revisions_per_slot: input.maxRevisionsPerSlot ?? 2,
    p_max_technical_retries: input.maxTechnicalRetries ?? 3,
    p_slots: input.slots.map((slot) => ({
      slot_key: slot.slotKey,
      ordinal: slot.ordinal,
      slot_spec: slot.slotSpec,
    })),
  });
  if (error) throw new Error(`Unable to create Question Factory run: ${error.message}`);

  const result = data as { run_id?: unknown; run_key?: unknown; status?: unknown; replayed?: unknown };
  if (
    typeof result?.run_id !== "number" || typeof result.run_key !== "string" ||
    typeof result.status !== "string" ||
    !RUN_STATUSES.has(result.status as CreateFactoryRunResult["status"]) ||
    typeof result.replayed !== "boolean"
  ) throw new Error("Question Factory create-run RPC returned an invalid result");

  return {
    runId: result.run_id,
    runKey: result.run_key,
    status: result.status as CreateFactoryRunResult["status"],
    replayed: result.replayed,
  };
}

export async function startFactoryRun(input: {
  runKey: string;
  expectedStateVersion: number;
  idempotencyKey: string;
  actorId: string;
}): Promise<StartFactoryRunResult> {
  if (!input.runKey.trim()) throw new Error("runKey is required");
  if (!Number.isSafeInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) {
    throw new Error("expectedStateVersion must be a nonnegative integer");
  }
  if (!input.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  if (!input.actorId.trim()) throw new Error("actorId is required");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("question_factory_start_run", {
    p_run_key: input.runKey,
    p_expected_state_version: input.expectedStateVersion,
    p_idempotency_key: input.idempotencyKey,
    p_actor_id: input.actorId,
  });
  if (error) throw new Error(`Unable to start Question Factory run: ${error.message}`);

  const result = data as {
    run_id?: unknown; run_key?: unknown; status?: unknown; state_version?: unknown; replayed?: unknown;
  };
  if (
    typeof result?.run_id !== "number" || typeof result.run_key !== "string" ||
    result.status !== "running" || typeof result.state_version !== "number" ||
    typeof result.replayed !== "boolean"
  ) throw new Error("Question Factory start-run RPC returned an invalid result");

  return {
    runId: result.run_id, runKey: result.run_key, status: result.status,
    stateVersion: result.state_version, replayed: result.replayed,
  };
}
