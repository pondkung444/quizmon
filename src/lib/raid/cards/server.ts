import "server-only";
import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPetImagePath } from "@/lib/petImage";
import type { Subline, Personality } from "@/lib/evolution";
import { createBattle, isBossId, type Battle, type Stats } from "./engine";

export type CardBattleView = {
  phase: "card_battle";
  runId: string;
  revision: number;
  battle: Battle;
  petName: string;
  petImage: string;
  bestProgress: number;
  question: RaidCardQuestion | null;
  feedback: RaidCardFeedback | null;
};
export type RaidCardQuestion = { revision:number; cardId:import("./engine").CardId; text:string; choices:string[]; imageUrl:string|null; subject:string; category:string };
export type RaidCardFeedback = { revision:number; correct:boolean; correctIndex:number; explanation:string|null; question:RaidCardQuestion };
export function cardRaidsEnabled() { return process.env.RAID_CARD_BATTLES_ENABLED !== "false"; }
export const serverRandom = () => randomInt(0, 1_000_000) / 1_000_000;
type BattleRow = { revision: number; state: Battle | null };

// Authenticated callers pass their verified user ID, never a user ID from the browser.
export async function readCardBattle(runId: string, userId: string): Promise<CardBattleView> {
  const admin = createAdminClient();
  const { data: run, error } = await admin.from("raid_runs")
    .select("id,pet_id,raid_type_id,stat_snapshot,phase")
    .eq("id", runId).eq("user_id", userId).single();
  if (error || !run) throw new Error("ไม่พบรอบท้าทายนี้");
  const [{ data: row, error: rowError }, { data: type }, { data: pet }] = await Promise.all([
    admin.from("raid_card_battles").select("revision,state").eq("run_id", runId).eq("user_id", userId).single<BattleRow>(),
    admin.from("raid_types").select("slug").eq("id", run.raid_type_id).single(),
    admin.from("pets").select("nickname,subline,personality,egg_types(sprite_prefix)").eq("id", run.pet_id).single(),
  ]);
  if (rowError || !row || !type || !isBossId(type.slug)) throw new Error("ยังโหลดสนามไม่สำเร็จ ลองใหม่อีกครั้ง");
  let battle = row.state;
  let revision = row.revision;
  if (!battle) {
    const initial = createBattle(type.slug, run.stat_snapshot as Stats, serverRandom);
    const { data, error: saveError } = await admin.rpc("commit_raid_card_turn", {
      p_run_id: runId, p_user_id: userId, p_revision: revision, p_state: initial,
    });
    if (saveError || !data) throw new Error("ยังเตรียมสนามไม่สำเร็จ ลองใหม่อีกครั้ง");
    battle = data.state as Battle;
    revision = data.revision as number;
  }
  if (battle.version !== 2) throw new Error("รอบนี้ใช้กติกาคนละรุ่น กรุณาอัปเดตหน้าเกม");
  const { data: best, error: bestError } = await admin.from("raid_card_battles")
    .select("progress").eq("user_id", userId).eq("raid_type_id", run.raid_type_id)
    .neq("run_id", runId).not("finished_at", "is", null).order("progress", { ascending: false }).limit(1);
  if (bestError) throw new Error("ยังโหลดสถิติไม่สำเร็จ ลองใหม่อีกครั้ง");
  const egg = (Array.isArray(pet?.egg_types) ? pet.egg_types[0] : pet?.egg_types) as { sprite_prefix: string } | null;
  const petImage = egg && pet?.subline && pet?.personality
    ? getPetImagePath(egg.sprite_prefix, 4, pet.subline as Subline, pet.personality as Personality)
    : "/pets/egg2_stage4_math_A.png";
  const [{data:pending,error:pendingError},{data:answered,error:answerError}] = await Promise.all([
    admin.from("raid_card_questions").select("revision,card_id,question").eq("run_id",runId).eq("revision",revision).is("answered_at",null).maybeSingle(),
    admin.from("raid_card_questions").select("revision,card_id,question,correct_index,answer_index,explanation").eq("run_id",runId).eq("revision",revision-1).not("answered_at","is",null).maybeSingle(),
  ]);
  if(pendingError || answerError) throw new Error("โหลดคำถามไม่สำเร็จ ลองโหลดสถานะล่าสุด");
  const question = pending ? {...pending.question,revision:pending.revision,cardId:pending.card_id} as RaidCardQuestion : null;
  const feedback = answered ? { revision:answered.revision,correct:answered.answer_index===answered.correct_index,correctIndex:answered.correct_index,explanation:answered.explanation,question:{...answered.question,revision:answered.revision,cardId:answered.card_id} as RaidCardQuestion } : null;
  return { phase: "card_battle", runId, revision, battle, petName: pet?.nickname || "Qmon", petImage, bestProgress: best?.[0]?.progress ?? 0,question,feedback };
}
