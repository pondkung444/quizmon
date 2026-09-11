"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCardId, resolveTurn } from "@/lib/raid/cards/engine";
import { readCardBattle, serverRandom, type CardBattleView } from "@/lib/raid/cards/server";
import type { ClaimRaidRewardResult } from "./actions";
import { mapRaidReward } from "@/lib/raid/reward";
import { revalidatePath } from "next/cache";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function identity(runId: string) {
  if (!UUID.test(runId)) throw new Error("รอบท้าทายไม่ถูกต้อง");
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user || user.is_anonymous) throw new Error("เข้าสู่ระบบก่อนท้าทาย");
  return { client, user };
}
export async function playRaidCard(runId: string, revision: number, cardId: string): Promise<CardBattleView> {
  const { user } = await identity(runId);
  if (!Number.isSafeInteger(revision) || revision < 1 || !isCardId(cardId)) throw new Error("คำสั่งไม่ถูกต้อง");
  const current = await readCardBattle(runId, user.id);
  // Retrying a committed request or using an old tab returns canonical state, never plays twice.
  if (current.revision !== revision || current.battle.outcome) return current;
  if (current.question) return current;
  const admin = createAdminClient();
  const { error } = await admin.rpc("prepare_raid_card_question", {
    p_run_id: runId, p_user_id: user.id, p_revision: revision, p_card_id: cardId,
  });
  if (error) throw new Error("ยังเตรียมโจทย์ไม่ได้ ตรวจว่าเลือกช่วงชั้นแล้วและมีโจทย์ใหม่ในคลัง จากนั้นลองอีกครั้ง");
  return readCardBattle(runId,user.id);
}
export async function answerRaidCard(runId:string,revision:number,answerIndex:number):Promise<CardBattleView> {
  const {user}=await identity(runId);
  if (!Number.isSafeInteger(revision) || revision<1 || !Number.isSafeInteger(answerIndex)) throw new Error("คำตอบไม่ถูกต้อง");
  const current=await readCardBattle(runId,user.id);
  if(current.revision!==revision || current.battle.outcome) return current;
  if(!current.question || answerIndex<0 || answerIndex>=current.question.choices.length) throw new Error("ไม่มีคำถามที่รอตอบ");
  const admin=createAdminClient();
  const {data:secret,error:readError}=await admin.from("raid_card_questions").select("correct_index").eq("run_id",runId).eq("revision",revision).single();
  if(readError || !secret) throw new Error("โหลดโจทย์ไม่สำเร็จ");
  const next=resolveTurn(current.battle,current.question.cardId,serverRandom,answerIndex===secret.correct_index);
  const {error}=await admin.rpc("answer_raid_card_question",{p_run_id:runId,p_user_id:user.id,p_revision:revision,p_answer:answerIndex,p_state:next});
  if(error) throw new Error("ยังบันทึกคำตอบไม่ได้ ลองใหม่ได้โดยไม่เล่นเทิร์นซ้ำ");
  return readCardBattle(runId,user.id);
}
export async function reloadRaidCardBattle(runId: string): Promise<CardBattleView> {
  const { user } = await identity(runId);
  return readCardBattle(runId, user.id);
}
export async function claimRaidCardReward(runId: string): Promise<ClaimRaidRewardResult> {
  const { client } = await identity(runId);
  const { data, error } = await client.rpc("claim_raid_card_reward", { p_run_id: runId }).single();
  if (error || !data) throw new Error("ยังรับรางวัลไม่สำเร็จ ลองใหม่ได้โดยไม่เสียของ");
  // The claim completes the run. Revalidating here replaces the mounted battle
  // with predeparture before the player can read the reward dialog.
  return mapRaidReward(data);
}

export async function acknowledgeRaidCardReward(runId: string): Promise<void> {
  await identity(runId);
  // Refresh inventory and available runs only after explicit acknowledgement.
  revalidatePath("/raid", "layout");
  revalidatePath("/pet");
}
