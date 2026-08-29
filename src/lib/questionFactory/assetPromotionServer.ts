import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactoryAssetBytes } from "@/lib/questionFactory/assetValidation";

const STAGING_BUCKET = "question-factory-assets";
const PUBLIC_BUCKET = "question-images";

export type FactoryAssetPromotionResult = {
  runId: number; slotId: number; questionId: number; assetId: number;
  state: string; stateVersion: number; publicPath: string; imageUrl: string; replayed: boolean;
};

async function verifiedDownload(bucket: string, path: string, mimeType: string, checksum: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Unable to verify ${bucket}/${path}: ${error?.message ?? "missing object"}`);
  const verified = validateFactoryAssetBytes({ bytes: new Uint8Array(await data.arrayBuffer()), mimeType, fileName: path });
  if (verified.checksum !== checksum) throw new Error(`${bucket}/${path} checksum does not match the approved asset`);
  return verified;
}

async function cleanupOwnUpload(path: string) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(PUBLIC_BUCKET).remove([path]);
  if (error) throw new Error(`Unable to clean up unbound product image: ${error.message}`);
  const probe = await admin.storage.from(PUBLIC_BUCKET).download(path);
  if (!probe.error) throw new Error("Product image cleanup reported success but the object still exists");
}

function parseResult(data: unknown): FactoryAssetPromotionResult {
  const row = data as Record<string, unknown>;
  if (typeof row?.run_id !== "number" || typeof row.slot_id !== "number" || typeof row.question_id !== "number" ||
      typeof row.asset_id !== "number" || typeof row.state !== "string" || typeof row.state_version !== "number" ||
      typeof row.public_path !== "string" || typeof row.image_url !== "string" || typeof row.replayed !== "boolean") {
    throw new Error("Factory asset promotion RPC returned an invalid result");
  }
  return { runId: row.run_id, slotId: row.slot_id, questionId: row.question_id, assetId: row.asset_id,
    state: row.state, stateVersion: row.state_version, publicPath: row.public_path,
    imageUrl: row.image_url, replayed: row.replayed };
}

export async function promoteFactoryAsset(input: {
  runKey: string; slotKey: string; expectedStateVersion: number; questionId: number;
  assetRevision: number; stagingPath: string; mimeType: "image/svg+xml" | "image/webp";
  checksum: string; actorId: string; idempotencyKey: string;
}): Promise<FactoryAssetPromotionResult> {
  const staged = await verifiedDownload(STAGING_BUCKET, input.stagingPath, input.mimeType, input.checksum);
  const publicPath = `q${input.questionId}.${staged.extension}`;
  const admin = createAdminClient();
  const source = await admin.storage.from(STAGING_BUCKET).download(input.stagingPath);
  if (source.error || !source.data) throw new Error(`Unable to download approved staging asset: ${source.error?.message ?? "missing object"}`);
  const bytes = new Uint8Array(await source.data.arrayBuffer());
  let uploadedHere = false;
  const upload = await admin.storage.from(PUBLIC_BUCKET).upload(publicPath, bytes, {
    contentType: staged.mimeType, cacheControl: "3600", upsert: false,
  });
  if (!upload.error) uploadedHere = true;
  else await verifiedDownload(PUBLIC_BUCKET, publicPath, staged.mimeType, staged.checksum);
  try {
    await verifiedDownload(PUBLIC_BUCKET, publicPath, staged.mimeType, staged.checksum);
    const imageUrl = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath).data.publicUrl;
    const { data, error } = await admin.rpc("question_factory_promote_asset", {
      p_run_key: input.runKey, p_slot_key: input.slotKey,
      p_expected_state_version: input.expectedStateVersion, p_question_id: input.questionId,
      p_asset_revision: input.assetRevision, p_checksum: input.checksum,
      p_public_path: publicPath, p_image_url: imageUrl,
      p_actor_id: input.actorId, p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(`Unable to promote Factory asset: ${error.message}`);
    return parseResult(data);
  } catch (error) {
    if (uploadedHere) {
      try { await cleanupOwnUpload(publicPath); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], "Asset promotion failed and compensating cleanup also failed"); }
    }
    throw error;
  }
}
