import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type FactoryHumanReviewDecision = "APPROVE" | "REQUEST_REVISION" | "REJECT";
export type FactoryHumanRevisionTarget = "text" | "asset" | null;

export type FactoryHumanReviewResult = {
  runId: number;
  slotId: number;
  slotKey: string;
  reviewId: number;
  state: string;
  stateVersion: number;
  replayed: boolean;
};

function parseResult(data: unknown): FactoryHumanReviewResult {
  const row = data as Record<string, unknown>;
  if (
    typeof row?.run_id !== "number" || typeof row.slot_id !== "number" ||
    typeof row.slot_key !== "string" || typeof row.review_id !== "number" ||
    typeof row.state !== "string" || typeof row.state_version !== "number" ||
    typeof row.replayed !== "boolean"
  ) {
    throw new Error("Factory Human Review RPC returned an invalid result");
  }
  return {
    runId: row.run_id, slotId: row.slot_id, slotKey: row.slot_key,
    reviewId: row.review_id, state: row.state, stateVersion: row.state_version,
    replayed: row.replayed,
  };
}

export async function recordFactoryHumanReview(input: {
  runKey: string;
  slotKey: string;
  expectedStateVersion: number;
  subjectRevision: number;
  mappingCandidateChecksum: string;
  assetRevision: number | null;
  assetChecksum: string | null;
  decision: FactoryHumanReviewDecision;
  revisionTarget: FactoryHumanRevisionTarget;
  issues: Array<Record<string, unknown>>;
  evidence: Record<string, unknown>;
  reviewerId: string;
  idempotencyKey: string;
}): Promise<FactoryHumanReviewResult> {
  if (!/^sha256:[0-9a-f]{64}$/.test(input.mappingCandidateChecksum)) {
    throw new Error("Mapping candidate checksum must be canonical sha256");
  }
  if (input.decision === "APPROVE" && input.issues.length !== 0) {
    throw new Error("Approval cannot contain unresolved issues");
  }
  if (input.decision !== "APPROVE" && input.issues.length === 0) {
    throw new Error("Revision and rejection decisions require issues");
  }
  if (
    (input.decision === "REQUEST_REVISION" && input.revisionTarget === null) ||
    (input.decision !== "REQUEST_REVISION" && input.revisionTarget !== null)
  ) {
    throw new Error("Revision target does not match Human Review decision");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("question_factory_record_human_review", {
    p_run_key: input.runKey,
    p_slot_key: input.slotKey,
    p_expected_state_version: input.expectedStateVersion,
    p_subject_revision: input.subjectRevision,
    p_mapping_candidate_checksum: input.mappingCandidateChecksum,
    p_asset_revision: input.assetRevision,
    p_asset_checksum: input.assetChecksum,
    p_decision: input.decision,
    p_revision_target: input.revisionTarget,
    p_issues: input.issues,
    p_evidence: input.evidence,
    p_reviewer_id: input.reviewerId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(`Unable to record Factory Human Review: ${error.message}`);
  return parseResult(data);
}
