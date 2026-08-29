import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimFactoryRun, nextFactoryWorkOrder, releaseFactoryRunLease, reserveFactoryRunBudget } from "./runControlsServer";
import { startSlotAuthoring, submitAuthorCandidate, submitQuestionQc } from "./textLoopServer";
import { validateFactoryQuestionCandidate, type FactoryQuestionCandidate, type FactoryQcDecision, type FactoryTextSlotSpec } from "./textCandidate";

const WORKER_ID="question-factory-gemini-v1";
const MODEL="gemini-flash-latest";

async function geminiJson(prompt:string):Promise<Record<string,unknown>>{
  const key=process.env.GEMINI_API_KEY;
  if(!key) throw new Error("GEMINI_API_KEY is not configured");
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),25_000);
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,{
      method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.25,maxOutputTokens:2400,responseMimeType:"application/json"}})});
    if(!response.ok) throw new Error(`Gemini worker error ${response.status}`);
    const body=await response.json(); const text=body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if(typeof text!=="string") throw new Error("Gemini worker returned no JSON");
    const value=JSON.parse(text); if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error("Gemini JSON must be an object");
    return value as Record<string,unknown>;
  }finally{clearTimeout(timeout);}
}

async function currentCandidate(runId:number,slotId:number):Promise<FactoryQuestionCandidate>{
  const admin=createAdminClient();
  const {data,error}=await admin.from("question_factory_events").select("payload").eq("run_id",runId).eq("slot_id",slotId)
    .in("event_type",["AUTHOR_COMPLETE","QUESTION_REVISED"]).order("id",{ascending:false}).limit(1).single();
  if(error) throw new Error(`Unable to load current candidate: ${error.message}`);
  return (data as {payload:{candidate:FactoryQuestionCandidate}}).payload.candidate;
}

async function authorCandidate(slot:FactoryTextSlotSpec,revision:number):Promise<FactoryQuestionCandidate>{
  const raw=await geminiJson(`คุณเป็นผู้แต่งข้อสอบไทยระดับมัธยม สร้างคำถามปรนัย 4 ตัวเลือกเพียงหนึ่งข้อให้ตรง blueprint นี้อย่างเคร่งครัด:\n${JSON.stringify(slot)}\nตอบ JSON เท่านั้น: {"questionText":"...","choices":["...","...","...","..."],"correctIndex":0,"explanation":"...","reasoningTemplate":"...","duplicateRisk":"low|medium|high"}. ห้ามอ้างว่ามีรูป และต้องมีคำตอบถูกเพียงข้อเดียว`);
  const candidate={schemaVersion:"question-candidate/v1",revision,questionText:String(raw.questionText??""),
    choices:raw.choices as [string,string,string,string],correctIndex:Number(raw.correctIndex),explanation:String(raw.explanation??""),
    answerType:"single_choice",learningObjective:slot.learningObjective,topic:slot.topic,difficulty:slot.difficulty,
    cognitiveDemand:slot.cognitiveDemand,questionArchetype:slot.questionArchetype,representationType:slot.representationType,
    needsAsset:false,assetPrompt:null,reasoningTemplate:String(raw.reasoningTemplate??""),
    duplicateRisk:String(raw.duplicateRisk??"low") as FactoryQuestionCandidate["duplicateRisk"],authorVersion:"question-authoring-gemini-v1"} satisfies FactoryQuestionCandidate;
  validateFactoryQuestionCandidate(candidate,slot); return candidate;
}

async function qcCandidate(candidate:FactoryQuestionCandidate):Promise<FactoryQcDecision>{
  const admin=createAdminClient();
  const duplicate=await admin.from("questions").select("id",{count:"exact",head:true}).eq("question_text",candidate.questionText);
  if(duplicate.error) throw new Error(`Duplicate scan failed: ${duplicate.error.message}`);
  if((duplicate.count??0)>0) return {schemaVersion:"question-qc/v1",decision:"REVISE",issues:[{code:"LEGACY_EXACT_DUPLICATE",
    severity:"major",message:"คำถามซ้ำกับคลังเดิม",requiredAction:"สร้างโจทย์สถานการณ์และตัวเลขใหม่"}],checks:{legacy_duplicate_scan:"fail"},notes:"Exact duplicate detected",qcVersion:"question-qc-gemini-v1"};
  const raw=await geminiJson(`คุณเป็นผู้ตรวจข้อสอบอิสระ ตรวจความถูกต้อง คำตอบเดียว ตัวลวง คำอธิบาย ภาษาไทย และความตรงตาม metadata ของข้อสอบนี้:\n${JSON.stringify(candidate)}\nตอบ JSON เท่านั้น: {"decision":"PASS|REVISE|REJECT","notes":"...","issues":[{"code":"UPPER_SNAKE_CASE","severity":"minor|major|critical","message":"...","requiredAction":"..."}]}. PASS ต้อง issues=[]`);
  const decision=String(raw.decision)==="PASS"?"PASS":String(raw.decision)==="REJECT"?"REJECT":"REVISE";
  const issues=Array.isArray(raw.issues)?raw.issues as FactoryQcDecision["issues"]:[];
  return {schemaVersion:"question-qc/v1",decision,issues:decision==="PASS"?[]:issues.length?issues:[{code:"QC_RESPONSE_INVALID",
    severity:"major",message:"QC ไม่ให้หลักฐานเพียงพอ",requiredAction:"สร้างและตรวจคำถามใหม่"}],checks:{answer_correctness:decision==="PASS"?"pass":"fail",
    choice_uniqueness:new Set(candidate.choices).size===4?"pass":"fail",explanation_consistency:decision==="PASS"?"pass":"fail",
    scope_alignment:"pass",difficulty_alignment:"pass",legacy_duplicate_scan:"pass",asset_contract:"not_applicable"},
    notes:String(raw.notes??"Independent Gemini QC"),qcVersion:"question-qc-gemini-v1"};
}

export async function processFactoryWorkSlice(){
  const admin=createAdminClient();
  const open=await admin.from("question_factory_runs").select("id,run_key,status,state_version").eq("status","running").order("id").limit(1).maybeSingle();
  if(open.error) throw open.error; if(!open.data) return {processed:false,reason:"NO_RUNNING_RUN"};
  const run=open.data as {id:number;run_key:string;state_version:number};
  const commandId=randomUUID(); let token=""; let leaseVersion=0;
  const existing=await admin.from("question_factory_run_leases").select("lease_token,lease_version,state,lease_owner,expires_at").eq("run_id",run.id).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data&&existing.data.state==="active"&&existing.data.lease_owner===WORKER_ID&&Date.parse(existing.data.expires_at)>Date.now()){
    token=existing.data.lease_token;leaseVersion=existing.data.lease_version;
  }else{
    const claim=await claimFactoryRun({runKey:run.run_key,expectedRunStateVersion:run.state_version,leaseOwner:WORKER_ID,ttlSeconds:120,idempotencyKey:`qf:worker:${commandId}:claim`});
    token=String(claim.lease_token);leaseVersion=Number(claim.lease_version);
  }
  try{
    const order=await nextFactoryWorkOrder(run.run_key,token);
    if(!order.available){
      if(order.reason==="WAITING_HUMAN_REVIEW") await admin.rpc("question_factory_mark_waiting_review",{p_run_key:run.run_key,
        p_expected_state_version:run.state_version,p_actor_id:WORKER_ID,p_idempotency_key:`qf:worker:${run.run_key}:waiting-review`});
      return {processed:false,reason:String(order.reason)};
    }
    const slotSpec=order.slot_spec as FactoryTextSlotSpec; const slotKey=String(order.slot_key); const stateVersion=Number(order.state_version);
    if(order.action==="START_AUTHORING") await startSlotAuthoring({runKey:run.run_key,slotKey,expectedStateVersion:stateVersion,
      idempotencyKey:`qf:worker:${commandId}:author-start`,actorId:WORKER_ID});
    else if(order.action==="AUTHOR_CANDIDATE"||order.action==="REVISE_CANDIDATE"){
      const budget=await admin.from("question_factory_run_budgets").select("budget_version").eq("run_id",run.id).single();
      if(budget.error) throw budget.error;
      const reserved=await reserveFactoryRunBudget({runKey:run.run_key,leaseToken:token,expectedBudgetVersion:budget.data.budget_version,
        workType:"generated_item",units:1,estimatedCostMicrounits:1000,actorId:WORKER_ID,idempotencyKey:`qf:worker:${commandId}:budget`});
      if(!reserved.reserved) return {processed:false,reason:String(reserved.reason_code)};
      const candidate=await authorCandidate(slotSpec,order.action==="REVISE_CANDIDATE"?Number((await admin.from("question_factory_slots").select("author_revision").eq("id",order.slot_id).single()).data?.author_revision??0)+1:1);
      await submitAuthorCandidate({runKey:run.run_key,slotKey,expectedStateVersion:stateVersion,idempotencyKey:`qf:worker:${commandId}:candidate`,actorId:WORKER_ID,candidate});
    }else if(order.action==="QUESTION_QC"){
      const candidate=await currentCandidate(run.id,Number(order.slot_id)); const decision=await qcCandidate(candidate);
      await submitQuestionQc({runKey:run.run_key,slotKey,expectedStateVersion:stateVersion,idempotencyKey:`qf:worker:${commandId}:qc`,actorId:WORKER_ID,decision});
    }else throw new Error(`Unsupported automated work order ${String(order.action)}`);
    return {processed:true,action:String(order.action),slotKey};
  }finally{
    await releaseFactoryRunLease({runKey:run.run_key,leaseToken:token,expectedLeaseVersion:leaseVersion,leaseOwner:WORKER_ID,
      idempotencyKey:`qf:worker:${commandId}:release`}).catch((error)=>console.error("Factory lease release failed",error));
  }
}
