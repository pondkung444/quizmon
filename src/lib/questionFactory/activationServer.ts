import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type FactoryActivationResult = {
  runId: number; slotId: number; questionId: number; state: string;
  stateVersion: number; activeCount: number; pipelineReadyCount: number; replayed: boolean;
};

export async function activateFactoryDraft(input: {
  runKey: string; slotKey: string; expectedStateVersion: number; questionId: number;
  mappingChecksum: string; actorId: string; idempotencyKey: string;
}): Promise<FactoryActivationResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("question_factory_activate_draft", {
    p_run_key: input.runKey, p_slot_key: input.slotKey,
    p_expected_state_version: input.expectedStateVersion, p_question_id: input.questionId,
    p_mapping_checksum: input.mappingChecksum, p_actor_id: input.actorId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(`Unable to activate Factory draft: ${error.message}`);
  const row = data as Record<string, unknown>;
  if (typeof row?.run_id !== "number" || typeof row.slot_id !== "number" ||
      typeof row.question_id !== "number" || typeof row.state !== "string" ||
      typeof row.state_version !== "number" || typeof row.active_count !== "number" ||
      typeof row.pipeline_ready_count !== "number" || typeof row.replayed !== "boolean") {
    throw new Error("Factory activation RPC returned an invalid result");
  }
  return {
    runId: row.run_id, slotId: row.slot_id, questionId: row.question_id,
    state: row.state, stateVersion: row.state_version, activeCount: row.active_count,
    pipelineReadyCount: row.pipeline_ready_count, replayed: row.replayed,
  };
}
