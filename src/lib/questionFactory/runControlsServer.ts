import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type RpcRow = Record<string, unknown>;

async function factoryRpc(name: string, args: Record<string, unknown>): Promise<RpcRow> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`Question Factory ${name} failed: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Question Factory ${name} returned an invalid result`);
  }
  return data as RpcRow;
}

export async function claimFactoryRun(input: {
  runKey: string; expectedRunStateVersion: number; leaseOwner: string;
  ttlSeconds: number; idempotencyKey: string;
}) {
  return factoryRpc("question_factory_claim_run", {
    p_run_key: input.runKey, p_expected_run_state_version: input.expectedRunStateVersion,
    p_lease_owner: input.leaseOwner, p_ttl_seconds: input.ttlSeconds,
    p_idempotency_key: input.idempotencyKey,
  });
}

export async function renewFactoryRunLease(input: {
  runKey: string; leaseToken: string; expectedLeaseVersion: number; leaseOwner: string;
  ttlSeconds: number; idempotencyKey: string;
}) {
  return factoryRpc("question_factory_renew_run_lease", {
    p_run_key: input.runKey, p_lease_token: input.leaseToken,
    p_expected_lease_version: input.expectedLeaseVersion, p_lease_owner: input.leaseOwner,
    p_ttl_seconds: input.ttlSeconds, p_idempotency_key: input.idempotencyKey,
  });
}

export async function releaseFactoryRunLease(input: {
  runKey: string; leaseToken: string; expectedLeaseVersion: number;
  leaseOwner: string; idempotencyKey: string;
}) {
  return factoryRpc("question_factory_release_run_lease", {
    p_run_key: input.runKey, p_lease_token: input.leaseToken,
    p_expected_lease_version: input.expectedLeaseVersion, p_lease_owner: input.leaseOwner,
    p_idempotency_key: input.idempotencyKey,
  });
}

export async function configureFactoryRunBudget(input: {
  runKey: string; expectedRunStateVersion: number; generatedItemLimit: number;
  assetBuildLimit: number; technicalRetryLimit: number; costLimitMicrounits: number;
  actorId: string; idempotencyKey: string;
}) {
  return factoryRpc("question_factory_configure_run_budget", {
    p_run_key: input.runKey, p_expected_run_state_version: input.expectedRunStateVersion,
    p_generated_item_limit: input.generatedItemLimit, p_asset_build_limit: input.assetBuildLimit,
    p_technical_retry_limit: input.technicalRetryLimit,
    p_cost_limit_microunits: input.costLimitMicrounits, p_actor_id: input.actorId,
    p_idempotency_key: input.idempotencyKey,
  });
}

export async function reserveFactoryRunBudget(input: {
  runKey: string; leaseToken: string; expectedBudgetVersion: number;
  workType: "generated_item" | "asset_build" | "technical_retry"; units: number;
  estimatedCostMicrounits: number; actorId: string; idempotencyKey: string;
}) {
  return factoryRpc("question_factory_reserve_run_budget", {
    p_run_key: input.runKey, p_lease_token: input.leaseToken,
    p_expected_budget_version: input.expectedBudgetVersion, p_work_type: input.workType,
    p_units: input.units, p_estimated_cost_microunits: input.estimatedCostMicrounits,
    p_actor_id: input.actorId, p_idempotency_key: input.idempotencyKey,
  });
}

export async function reconcileFactoryRun(runKey: string) {
  return factoryRpc("question_factory_reconcile_run", { p_run_key: runKey });
}
