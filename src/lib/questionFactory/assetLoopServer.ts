import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactoryAssetBytes } from "@/lib/questionFactory/assetValidation";

const BUCKET="question-factory-assets";
type AssetResult={runId:number;slotId:number;assetId:number;assetRevision:number;state:string;stateVersion:number;replayed:boolean};

function parseResult(data:unknown):AssetResult{
  const r=data as Record<string,unknown>;
  if(typeof r?.run_id!=="number"||typeof r.slot_id!=="number"||typeof r.asset_id!=="number"||
    typeof r.asset_revision!=="number"||typeof r.state!=="string"||typeof r.state_version!=="number"||typeof r.replayed!=="boolean")
    throw new Error("Factory asset RPC returned an invalid result");
  return {runId:r.run_id,slotId:r.slot_id,assetId:r.asset_id,assetRevision:r.asset_revision,
    state:r.state,stateVersion:r.state_version,replayed:r.replayed};
}

async function downloadVerified(path:string,mimeType:string,checksum:string){
  const admin=createAdminClient();
  const {data,error}=await admin.storage.from(BUCKET).download(path);
  if(error||!data)throw new Error(`Unable to verify staged asset download: ${error?.message??"missing object"}`);
  const bytes=new Uint8Array(await data.arrayBuffer());
  const verified=validateFactoryAssetBytes({bytes,mimeType,fileName:path});
  if(verified.checksum!==checksum)throw new Error("Staged asset checksum changed after upload");
  return verified;
}

async function cleanupOwnUpload(path:string):Promise<void>{
  const admin=createAdminClient();
  const {error}=await admin.storage.from(BUCKET).remove([path]);
  if(error)throw new Error(`Unable to clean up unregistered staged asset: ${error.message}`);
  const probe=await admin.storage.from(BUCKET).download(path);
  if(!probe.error)throw new Error("Staged asset cleanup reported success but object still exists");
}

export async function uploadAndRegisterFactoryAsset(input:{
  runKey:string;slotKey:string;expectedStateVersion:number;assetRevision:number;
  representationType:string;bytes:Uint8Array;mimeType:"image/svg+xml"|"image/webp";
  buildSpec:Record<string,unknown>;idempotencyKey:string;actorId:string;
}):Promise<AssetResult>{
  const extension=input.mimeType==="image/svg+xml"?"svg":"webp";
  const path=`runs/${input.runKey}/slots/${input.slotKey}/rev-${input.assetRevision}.${extension}`;
  const verified=validateFactoryAssetBytes({bytes:input.bytes,mimeType:input.mimeType,fileName:path});
  const admin=createAdminClient();
  let uploadedHere=false;
  const upload=await admin.storage.from(BUCKET).upload(path,input.bytes,{contentType:input.mimeType,cacheControl:"60",upsert:false});
  if(!upload.error)uploadedHere=true;
  else {
    // A retry after an uncertain response may encounter the exact object already uploaded.
    // Never overwrite it; accept only when a fresh download proves identical bytes.
    await downloadVerified(path,input.mimeType,verified.checksum);
  }
  try{
    const downloaded=await downloadVerified(path,input.mimeType,verified.checksum);
    const {data,error}=await admin.rpc("question_factory_register_asset",{
      p_run_key:input.runKey,p_slot_key:input.slotKey,p_expected_state_version:input.expectedStateVersion,
      p_asset_revision:input.assetRevision,p_representation_type:input.representationType,p_staging_path:path,
      p_mime_type:downloaded.mimeType,p_byte_size:downloaded.byteSize,p_checksum:downloaded.checksum,
      p_width:downloaded.width,p_height:downloaded.height,p_build_spec:input.buildSpec,
      p_idempotency_key:input.idempotencyKey,p_actor_id:input.actorId,
    });
    if(error)throw new Error(`Unable to register Factory asset: ${error.message}`);
    return parseResult(data);
  }catch(error){
    if(uploadedHere){
      try{await cleanupOwnUpload(path);}catch(cleanupError){
        throw new AggregateError([error,cleanupError],"Asset registration failed and compensating cleanup also failed");
      }
    }
    throw error;
  }
}

export async function recordFactoryAssetQc(input:{
  runKey:string;slotKey:string;expectedStateVersion:number;assetRevision:number;checksum:string;
  decision:"PASS"|"REGENERATE"|"REJECT";issues:Array<Record<string,unknown>>;
  idempotencyKey:string;actorId:string;
}):Promise<AssetResult>{
  if(input.decision==="PASS"&&input.issues.length)throw new Error("Image QC PASS must not contain issues");
  if(input.decision!=="PASS"&&!input.issues.length)throw new Error("Image QC failure requires issues");
  const admin=createAdminClient();
  const {data,error}=await admin.rpc("question_factory_record_asset_qc",{
    p_run_key:input.runKey,p_slot_key:input.slotKey,p_expected_state_version:input.expectedStateVersion,
    p_asset_revision:input.assetRevision,p_checksum:input.checksum,p_decision:input.decision,
    p_issues:input.issues,p_idempotency_key:input.idempotencyKey,p_actor_id:input.actorId,
  });
  if(error)throw new Error(`Unable to record Factory Image QC: ${error.message}`);
  return parseResult(data);
}
