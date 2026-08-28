import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateFactoryQcDecision,
  validateFactoryQuestionCandidate,
  type FactoryQcDecision,
  type FactoryQuestionCandidate,
  type FactoryTextSlotSpec,
} from "@/lib/questionFactory/textCandidate";

type SlotContext = {
  runId: number;
  slotId: number;
  state: string;
  stateVersion: number;
  authorRevision: number;
  slotSpec: FactoryTextSlotSpec;
};

export type FactoryTextTransitionResult = {
  runId: number;
  slotId: number;
  slotKey: string;
  state: string;
  stateVersion: number;
  replayed: boolean;
};

async function loadSlot(runKey: string, slotKey: string): Promise<SlotContext> {
  const admin = createAdminClient();
  const run = await admin.from("question_factory_runs").select("id").eq("run_key", runKey).single();
  if (run.error) throw new Error(`Unable to load Factory run: ${run.error.message}`);
  const slot = await admin.from("question_factory_slots")
    .select("id, state, state_version, author_revision, slot_spec")
    .eq("run_id", (run.data as { id: number }).id).eq("slot_key", slotKey).single();
  if (slot.error) throw new Error(`Unable to load Factory slot: ${slot.error.message}`);
  const row = slot.data as { id:number; state:string; state_version:number; author_revision:number; slot_spec:FactoryTextSlotSpec };
  return { runId:(run.data as {id:number}).id, slotId:row.id, state:row.state,
    stateVersion:row.state_version, authorRevision:row.author_revision, slotSpec:row.slot_spec };
}

async function transition(input: {
  runKey:string; slotKey:string; expectedStateVersion:number; fromState:string; toState:string;
  eventType:string; reasonCode:string; payload:Record<string,unknown>; idempotencyKey:string; actorId:string;
}): Promise<FactoryTextTransitionResult> {
  const admin=createAdminClient();
  const {data,error}=await admin.rpc("question_factory_transition_text_slot",{
    p_run_key:input.runKey,p_slot_key:input.slotKey,p_expected_state_version:input.expectedStateVersion,
    p_from_state:input.fromState,p_to_state:input.toState,p_event_type:input.eventType,
    p_reason_code:input.reasonCode,p_payload:input.payload,p_idempotency_key:input.idempotencyKey,p_actor_id:input.actorId,
  });
  if(error)throw new Error(`Unable to transition Factory text slot: ${error.message}`);
  const r=data as Record<string,unknown>;
  if(typeof r.run_id!=="number"||typeof r.slot_id!=="number"||typeof r.slot_key!=="string"||
    typeof r.state!=="string"||typeof r.state_version!=="number"||typeof r.replayed!=="boolean")
    throw new Error("Factory text transition returned an invalid result");
  return {runId:r.run_id,slotId:r.slot_id,slotKey:r.slot_key,state:r.state,
    stateVersion:r.state_version,replayed:r.replayed};
}

export async function startSlotAuthoring(input:{runKey:string;slotKey:string;expectedStateVersion:number;idempotencyKey:string;actorId:string}) {
  return transition({...input,fromState:"planned",toState:"authoring",eventType:"AUTHOR_STARTED",
    reasonCode:"BLUEPRINT_SLOT_ASSIGNED",payload:{}});
}

export async function submitAuthorCandidate(input:{
  runKey:string;slotKey:string;expectedStateVersion:number;idempotencyKey:string;actorId:string;
  candidate:FactoryQuestionCandidate;
}) {
  const slot=await loadSlot(input.runKey,input.slotKey);
  if(slot.state!=="authoring"&&slot.state!=="author_revision")throw new Error("Slot is not accepting an Author candidate");
  if(slot.stateVersion!==input.expectedStateVersion)throw new Error("Slot state/version conflict before candidate validation");
  if(input.candidate.revision!==slot.authorRevision+1)throw new Error("Candidate revision is not the next slot revision");
  validateFactoryQuestionCandidate(input.candidate,slot.slotSpec);
  return transition({...input,fromState:slot.state,toState:"question_qc",
    eventType:slot.state==="authoring"?"AUTHOR_COMPLETE":"QUESTION_REVISED",
    reasonCode:"CANDIDATE_SCHEMA_VALID",payload:{candidate:input.candidate}});
}

export async function submitQuestionQc(input:{
  runKey:string;slotKey:string;expectedStateVersion:number;idempotencyKey:string;actorId:string;
  decision:FactoryQcDecision;
}) {
  validateFactoryQcDecision(input.decision);
  const slot=await loadSlot(input.runKey,input.slotKey);
  if(slot.state!=="question_qc"||slot.stateVersion!==input.expectedStateVersion)
    throw new Error("Slot state/version conflict before QC decision");
  let toState:string,eventType:string,reasonCode:string;
  if(input.decision.decision==="REVISE"){
    toState="author_revision";eventType="QUESTION_QC_REVISE";reasonCode="QC_REQUIRES_REVISION";
  }else if(input.decision.decision==="REJECT"){
    toState="rejected";eventType="QUESTION_QC_REJECT";reasonCode="QC_TERMINAL_REJECT";
  }else{
    toState=slot.slotSpec.representationType==="none"?"pending_human_review":"asset_build";
    eventType="QUESTION_QC_PASS";reasonCode=toState==="asset_build"?"TEXT_QC_PASS_ASSET_REQUIRED":"TEXT_QC_PASS_NO_ASSET";
  }
  return transition({...input,fromState:"question_qc",toState,eventType,reasonCode,payload:{decision:input.decision}});
}
