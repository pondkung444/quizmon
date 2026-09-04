// ตรรกะ "ขยับ stage + ล็อก subline ตอนเข้า stage 3" จุดเดียวของแอป
// - planPetEvolution(): อ่านอย่างเดียว (นอกจาก RPC get_pet_branch_counts) คืนผลว่าจะขยับไหม
//   ใช้โดย finishQuizRound() (quiz ปกติ — เขียน stage คู่กับ exp เองในก้อนเดียว) กับ evolvePet()
// - evolvePet(): เรียก planPetEvolution แล้วเขียน stage/subline แบบมี guard (idempotent)
//   ใช้โดย applyPvpMatchEvolution() (PvP) กับ safety-net หน้า /pet
//
// evolution.ts ยังเป็นไฟล์ห้ามแก้ — ที่นี่ import ใช้ (tryAdvanceStage/determineSubline) เท่านั้น

import type { createClient } from "@/lib/supabase/server";
import { tryAdvanceStage, determineSubline } from "@/lib/evolution";
import { getGradeBand } from "@/lib/gradeBand";
import { resolveSeniorLine, type PetLine, type SeniorLine } from "@/lib/petLine";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PetEvolvePlan = {
  newStage: number;
  evolved: boolean;
  reachedStage4: boolean;
  computedSubline: PetLine | null; // set เมื่อขยับเข้า stage 3 (junior/senior) — write แบบ guard .is(subline,null)
  seniorLockCounts: Partial<Record<SeniorLine, number>> | null; // สำหรับ analytics event (senior เท่านั้น)
};

export type PetEvolveOutcome = {
  evolved: boolean;
  fromStage: number;
  toStage: number;
  reachedStage4: boolean;
};

type EvolvablePet = {
  id: string;
  stage: number;
  math_correct: number;
  science_correct: number;
};

// ตรรกะ *เดียวกันเป๊ะ* กับที่ finishQuizRound() เคย inline ไว้ (quiz/actions.ts) — ห้าม diverge
export async function planPetEvolution(
  supabase: SupabaseServerClient,
  userId: string,
  pet: EvolvablePet,
  newExp: number
): Promise<PetEvolvePlan> {
  const newStage = tryAdvanceStage(pet.stage, newExp);

  let computedSubline: PetLine | null = null;
  let seniorLockCounts: Partial<Record<SeniorLine, number>> | null = null;

  if (pet.stage < 3 && newStage === 3) {
    const band = await getGradeBand(userId);
    if (band === "junior") {
      computedSubline = determineSubline(pet.math_correct, pet.science_correct);
    } else {
      const { data: branchCounts } = await supabase.rpc("get_pet_branch_counts", {
        p_pet_id: pet.id,
      });
      const counts: Partial<Record<SeniorLine, number>> = {};
      for (const row of (branchCounts ?? []) as { branch: string; correct_count: number }[]) {
        if (row.branch === "physics" || row.branch === "chemistry" || row.branch === "biology") {
          counts[row.branch] = row.correct_count;
        }
      }
      computedSubline = resolveSeniorLine(counts);
      seniorLockCounts = counts;
    }
  }

  return {
    newStage,
    evolved: newStage !== pet.stage,
    reachedStage4: pet.stage < 4 && newStage === 4,
    computedSubline,
    seniorLockCounts,
  };
}

// เรียก planPetEvolution แล้วเขียนจริง — guard ด้วย stage เดิม / .is(subline,null) จึง idempotent
// (เรียกซ้ำสำหรับ pet ที่ขยับไปแล้ว = no-op). screen = ค่า analytics_events.screen ('/quiz' | '/pvp' | '/pet')
export async function evolvePet(
  supabase: SupabaseServerClient,
  userId: string,
  pet: EvolvablePet,
  newExp: number,
  screen: string
): Promise<PetEvolveOutcome> {
  const plan = await planPetEvolution(supabase, userId, pet, newExp);
  const outcome: PetEvolveOutcome = {
    evolved: plan.evolved,
    fromStage: pet.stage,
    toStage: plan.newStage,
    reachedStage4: plan.reachedStage4,
  };
  if (!plan.evolved) return outcome;

  await supabase.from("pets").update({ stage: plan.newStage }).eq("id", pet.id).eq("stage", pet.stage);

  if (plan.computedSubline) {
    const { data: locked } = await supabase
      .from("pets")
      .update({ subline: plan.computedSubline })
      .eq("id", pet.id)
      .is("subline", null)
      .select("id")
      .maybeSingle();

    if (locked && plan.seniorLockCounts) {
      await supabase.from("analytics_events").insert({
        user_id: userId,
        session_id: crypto.randomUUID(),
        event_name: "senior_subline_locked",
        screen,
        pet_id: pet.id,
        props: {
          line: plan.computedSubline,
          physics: plan.seniorLockCounts.physics ?? 0,
          chemistry: plan.seniorLockCounts.chemistry ?? 0,
          biology: plan.seniorLockCounts.biology ?? 0,
        },
        client_ts: new Date().toISOString(),
      });
    }
  }

  return outcome;
}
