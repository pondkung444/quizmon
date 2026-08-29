import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCurriculumChapterScopeKey } from "@/lib/questionFactory/curriculumChapter";
import type { QuestionFactoryEducationStage, QuestionFactorySubject } from "@/lib/questionFactory/scopeKey";

type JsonObject = Record<string, unknown>;

export type FactoryCommandOption = {
  mappingId: string; chapterKey: string; topicId: string; stage: QuestionFactoryEducationStage;
  subject: QuestionFactorySubject; grade: number; gradeLevel: string; subjectLabel: string;
  chapter: string; category: string;
};

export type FactoryCommandCenterSnapshot = {
  blockedBy: { runId: number; runKey: string; status: string; scopeKey: string; stateVersion: number } | null;
  options: FactoryCommandOption[];
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as JsonObject).sort(([a],[b]) => a.localeCompare(b))
    .map(([key,item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function checksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
function gradeNumber(label: string): number {
  const value=Number(label.replace("ม.",""))+6;
  if (!Number.isInteger(value) || value<7 || value>12) throw new Error("Unsupported curriculum grade");
  return value;
}

export async function loadFactoryCommandCenter(): Promise<FactoryCommandCenterSnapshot> {
  const admin=createAdminClient();
  const [open, mappings, chapters]=await Promise.all([
    admin.from("question_factory_runs").select("id, run_key, status, scope_key, state_version")
      .in("status",["created","running","paused","waiting_human_review"]).order("id").limit(1).maybeSingle(),
    admin.from("question_factory_category_registry").select("mapping_id, chapter_key, topic_id, education_stage, factory_subject, product_category"),
    admin.from("curriculum_chapters").select("chapter_key, grade_level, subject_label, chapter"),
  ]);
  if(open.error||mappings.error||chapters.error) throw new Error("Unable to load Factory command preflight");
  const chapterByKey=new Map((chapters.data??[]).map((row) => [String(row.chapter_key),row]));
  const options=(mappings.data??[]).flatMap((row) => {
    const chapter=chapterByKey.get(String(row.chapter_key));
    if(!chapter?.grade_level) return [];
    return [{
      mappingId:String(row.mapping_id),chapterKey:String(row.chapter_key),topicId:String(row.topic_id),
      stage:String(row.education_stage) as QuestionFactoryEducationStage,
      subject:String(row.factory_subject) as QuestionFactorySubject,grade:gradeNumber(String(chapter.grade_level)),
      gradeLevel:String(chapter.grade_level),subjectLabel:String(chapter.subject_label),chapter:String(chapter.chapter),
      category:String(row.product_category),
    }];
  }).sort((a,b)=>a.grade-b.grade||a.subjectLabel.localeCompare(b.subjectLabel,"th")||a.chapter.localeCompare(b.chapter,"th"));
  const blocker=open.data as {id:number;run_key:string;status:string;scope_key:string;state_version:number}|null;
  return {blockedBy:blocker?{runId:blocker.id,runKey:blocker.run_key,status:blocker.status,
    scopeKey:blocker.scope_key,stateVersion:blocker.state_version}:null,options};
}

export async function commandFactoryRun(input: {
  commandKey: string; mappingId: string; actorId: string; learningObjective: string;
  count: number; easy: number; medium: number; hard: number; costLimitMicrounits: number;
}) {
  const snapshot=await loadFactoryCommandCenter();
  if(snapshot.blockedBy) throw new Error(`มี Run ${snapshot.blockedBy.runId} ที่ยังไม่จบ`);
  const option=snapshot.options.find((item)=>item.mappingId===input.mappingId);
  if(!option) throw new Error("ไม่พบ curriculum/category mapping ที่อนุมัติแล้ว");
  if(!/^[0-9a-f-]{36}$/i.test(input.commandKey)) throw new Error("Invalid command key");
  if(!input.actorId.trim()||!input.learningObjective.trim()) throw new Error("กรุณาระบุผู้สั่งและเป้าหมายการเรียนรู้");
  if(!Number.isInteger(input.count)||input.count<1||input.count>20||input.easy+input.medium+input.hard!==input.count
    ||[input.easy,input.medium,input.hard].some((v)=>!Number.isInteger(v)||v<0)) throw new Error("จำนวนและระดับความยากไม่ถูกต้อง");
  if(!Number.isSafeInteger(input.costLimitMicrounits)||input.costLimitMicrounits<0) throw new Error("Cost budget ไม่ถูกต้อง");
  const difficulties=[...Array(input.easy).fill(1),...Array(input.medium).fill(2),...Array(input.hard).fill(3)];
  const slots=difficulties.map((difficulty,index)=>({slot_key:`command-${String(index+1).padStart(3,"0")}`,
    ordinal:index+1,slot_spec:{learningObjective:input.learningObjective.trim(),topic:option.topicId,difficulty,
      cognitiveDemand:difficulty===1?"understand":difficulty===2?"apply":"analyze",
      questionArchetype:`coverage_slot_${String(index+1).padStart(3,"0")}`,representationType:"none",answerType:"single_choice"}}));
  const scopeKey=buildCurriculumChapterScopeKey({chapterKey:option.chapterKey,stage:option.stage,
    grade:option.grade as 7|8|9|10|11|12,subject:option.subject});
  const profile={schemaVersion:"question-factory-profile/v1",scope:{stage:option.stage,grade:option.grade,
    subject:option.subject,unit:option.chapterKey},curriculumChapter:{curriculumChapterKey:option.chapterKey,
    gradeLevel:option.gradeLevel,subjectLabel:option.subjectLabel,chapter:option.chapter},categoryMapping:{
    mappingEntryId:option.mappingId,mappingVersion:"question-product-mapping/v1",topicId:option.topicId,
    productCategory:option.category},publicationPolicy:"human-review-required-no-auto-publish"};
  const blueprint={schemaVersion:"question-factory-blueprint/v1",targetItems:input.count,
    representationPolicy:"text-only",difficultyDistribution:{"1":input.easy,"2":input.medium,"3":input.hard},slots};
  const profileChecksum=checksum(profile),blueprintChecksum=checksum(blueprint);
  const requestChecksum=checksum({scopeKey,actorId:input.actorId,profile,blueprint,slots});
  const admin=createAdminClient();
  const {data,error}=await admin.rpc("question_factory_command_run",{p_command:{run_key:input.commandKey,
    request_checksum:requestChecksum,scope_key:scopeKey,actor_id:input.actorId,idempotency_key:`qf:command:${input.commandKey}`,
    profile:{id:`command-profile-${option.chapterKey}`,version:input.commandKey,schema_version:"question-factory-profile/v1",
      checksum:profileChecksum,resolved:profile},blueprint:{id:`command-blueprint-${option.chapterKey}`,version:input.commandKey,
      schema_version:"question-factory-blueprint/v1",checksum:blueprintChecksum,resolved:blueprint},slots,
    target_active:input.count,preferred_batch_size:Math.min(10,input.count),max_batch_size:Math.min(20,input.count),
    max_generated_items:input.count,max_revisions_per_slot:2,max_technical_retries:3,
    generated_item_limit:input.count,asset_build_limit:0,technical_retry_limit:input.count*3,
    cost_limit_microunits:input.costLimitMicrounits}});
  if(error) throw new Error(`สร้าง Run ไม่สำเร็จ: ${error.message}`);
  return data as Record<string,unknown>;
}

export function newFactoryCommandKey(): string { return randomUUID(); }
