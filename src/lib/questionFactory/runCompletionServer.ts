import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type FactoryRunCompletionResult = {
  runId: number;
  status: "completed";
  stateVersion: number;
  activeCount: number;
  pipelineReadyCount: number;
  completedAt: string;
  replayed: boolean;
};

export async function completeFactoryRun(input: {
  runKey: string;
  expectedStateVersion: number;
  actorId: string;
  idempotencyKey: string;
}): Promise<FactoryRunCompletionResult> {
  if (!Number.isSafeInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) {
    throw new Error("Factory Run state version must be nonnegative");
  }
  if (!input.actorId.trim() || !input.idempotencyKey.trim()) {
    throw new Error("Factory Run completion actor and idempotency key are required");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("question_factory_complete_run", {
    p_run_key: input.runKey,
    p_expected_state_version: input.expectedStateVersion,
    p_actor_id: input.actorId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(`Unable to complete Factory Run: ${error.message}`);

  const row = data as Record<string, unknown>;
  if (
    typeof row?.run_id !== "number" || row.status !== "completed" ||
    typeof row.state_version !== "number" || typeof row.active_count !== "number" ||
    typeof row.pipeline_ready_count !== "number" || typeof row.completed_at !== "string" ||
    typeof row.replayed !== "boolean"
  ) {
    throw new Error("Factory Run completion RPC returned an invalid result");
  }
  return {
    runId: row.run_id,
    status: row.status,
    stateVersion: row.state_version,
    activeCount: row.active_count,
    pipelineReadyCount: row.pipeline_ready_count,
    completedAt: row.completed_at,
    replayed: row.replayed,
  };
}
