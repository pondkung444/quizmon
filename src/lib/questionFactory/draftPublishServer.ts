import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductMappingCandidate } from "@/lib/questionFactory/productMapping";

export type FactoryDraftPublishResult = {
  runId: number; slotId: number; slotKey: string; questionId: number; mappingId: number;
  state: string; stateVersion: number; replayed: boolean;
};

export async function publishFactoryDraft(input: {
  runKey: string; slotKey: string; expectedStateVersion: number;
  mappingCandidate: ProductMappingCandidate; actorId: string; idempotencyKey: string;
}): Promise<FactoryDraftPublishResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("question_factory_publish_draft", {
    p_run_key: input.runKey, p_slot_key: input.slotKey,
    p_expected_state_version: input.expectedStateVersion,
    p_mapping_candidate: input.mappingCandidate,
    p_mapping_candidate_checksum: input.mappingCandidate.checksum,
    p_actor_id: input.actorId, p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(`Unable to publish Factory draft: ${error.message}`);
  const row = data as Record<string, unknown>;
  if (typeof row?.run_id !== "number" || typeof row.slot_id !== "number" ||
      typeof row.slot_key !== "string" || typeof row.question_id !== "number" ||
      typeof row.mapping_id !== "number" || typeof row.state !== "string" ||
      typeof row.state_version !== "number" || typeof row.replayed !== "boolean") {
    throw new Error("Factory draft publication RPC returned an invalid result");
  }
  return {
    runId: row.run_id, slotId: row.slot_id, slotKey: row.slot_key,
    questionId: row.question_id, mappingId: row.mapping_id, state: row.state,
    stateVersion: row.state_version, replayed: row.replayed,
  };
}
