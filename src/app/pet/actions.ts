"use server";

import { createClient } from "@/lib/supabase/server";
import {
  determinePersonality,
  computeRawStats,
  snapshotStats,
  type Subline,
  type Personality,
} from "@/lib/evolution";
import { getTodayInBangkok } from "@/lib/exp";

export async function collectPet(): Promise<{ collected: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  // 1) หา active pet ต้องเป็น stage 4 เท่านั้นถึงเก็บได้
  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, stage, subline, personality")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (petError || !pet) throw new Error("ไม่พบ Qmon ที่กำลังเลี้ยงอยู่");
  if (pet.stage !== 4) throw new Error("Qmon ตัวนี้ยังโตไม่เต็มที่ เก็บเข้าสมุดไม่ได้");

  // 2) เก็บเข้าสมุด (is_active = false)
  const { error: collectError } = await supabase
    .from("pets")
    .update({ is_active: false })
    .eq("id", pet.id);

  if (collectError) throw new Error("เก็บ Qmon เข้าสมุดไม่สำเร็จ: " + collectError.message);

  // track เฉพาะตอน update ผ่านแล้วเท่านั้น — insert ตรงจากฝั่ง server (ไม่ใช้
  // src/lib/analytics.ts track() เพราะฟังก์ชันนั้น early-return ทุกครั้งถ้า
  // typeof window === "undefined" ซึ่งเป็นจริงเสมอในนี้ เรียกจาก server action)
  // เก็บ event นี้ไว้เสมอ ไม่กรอง admin/dev account ออก (ต่างจาก /api/analytics
  // route.ts) เพราะ event นี้ต้องใช้ derive weekly journey ของ user ทุกคนรวมถึง
  // dev เอง ไม่ใช่แค่ insight รวมที่ /admin/analytics ดู
  await supabase.from("analytics_events").insert({
    user_id: user.id,
    session_id: crypto.randomUUID(),
    event_name: "collect",
    screen: "/pet",
    pet_id: pet.id,
    props: {
      final_stage: pet.stage,
      subline: pet.subline,
      personality: pet.personality,
    },
    client_ts: new Date().toISOString(),
  });

  // ไข่ใบต่อไปไม่ auto-grant แล้ว — ผู้เล่นเลือกเองผ่าน chooseEggAfterCollect() ทุกครั้ง
  return { collected: true };
}

// ผู้เล่นยืนยันไข่ที่เลือกหลังเก็บสัตว์เข้าสมุด (จอ/modal เลือกไข่)
export async function chooseEggAfterCollect(eggTypeId: string): Promise<{ playerEggId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const { data: eggType, error: eggTypeError } = await supabase
    .from("egg_types")
    .select("id")
    .eq("id", eggTypeId)
    .eq("is_obtainable", true)
    .maybeSingle();

  if (eggTypeError || !eggType) throw new Error("ไม่พบไข่ชนิดนี้");

  const { data: inserted, error: insertError } = await supabase
    .from("player_eggs")
    .insert({ user_id: user.id, egg_type_id: eggTypeId, source: "collection_choice" })
    .select("id")
    .single();

  if (insertError || !inserted) throw new Error("เพิ่มไข่เข้าคลังไม่สำเร็จ: " + insertError?.message);

  return { playerEggId: inserted.id };
}

export type StageUpContext = {
  spritePrefix: string;
  subline: Subline;
  eggNameTh: string;
};

// ข้อมูลที่ StageUpModal ต้องใช้ก่อนถามคำถาม (ยังไม่รู้ personality) — คืน null ถ้าไม่มีอะไรค้างให้เลือก
// (เช่น เลือกไปแล้วจากอีกแท็บ) ให้ผู้เรียกปิดจอไปเงียบๆ แทนที่จะ error
export async function getStageUpContext(): Promise<StageUpContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const { data: pet } = await supabase
    .from("pets")
    .select("stage, subline, personality, egg_types(sprite_prefix, name_th)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!pet || pet.stage !== 4 || pet.personality) return null;

  if (!pet.subline) {
    throw new Error("Qmon ถึงระยะ 4 แต่ไม่มี subline บันทึกไว้ — ข้อมูลไม่ครบ คำนวณบุคลิก/สเตตัสต่อไม่ได้");
  }

  const eggType = Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types;
  if (!eggType) throw new Error("ไม่พบข้อมูลไข่ของ Qmon ตัวนี้");

  return {
    spritePrefix: eggType.sprite_prefix,
    subline: pet.subline as Subline,
    eggNameTh: eggType.name_th,
  };
}

export type ChoosePersonalityResult = {
  personality: Personality;
  stats: { hp: number; atk: number; def: number; spd: number; foc: number };
};

// ⚠️ ลำดับสำคัญที่สุด: ล็อก pets.personality ลง DB ให้เสร็จ (อ่านย้อนยืนยันด้วย) ก่อนเสมอ
// แล้วค่อย snapshot stat_* (personality_bonus เป็น input ของสูตร — ดู v3 หมวด 4.4)
// ถ้าล็อกไม่สำเร็จ หรือยืนยันย้อนแล้วไม่ตรง -> throw ทันที ไม่คำนวณสเตตัสต่อเด็ดขาด (กันสเตตัสเพี้ยนเงียบๆ)
// ฟังก์ชันนี้ retry ได้ปลอดภัย: ถ้า personality ล็อกไปแล้วแต่ snapshot stat รอบก่อนพังกลางทาง
// เรียกซ้ำจะข้ามการล็อก (ไม่เขียนทับด้วยค่าอื่น) แล้วลองคำนวณ/บันทึกสเตตัสต่อจากค่าที่ล็อกไว้เดิม
export async function choosePersonalityAfterEvolve(choiceRaw: string): Promise<ChoosePersonalityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  // choiceRaw มาจาก 2 ทาง: บุคลิกที่ตัดสินแล้วจากอาหาร (getPersonalityFoodDecision) หรือคำตอบดิบจาก
  // คำถาม fallback ใน PersonalityDecisionModal — validate ตรงนี้เอง (determinePersonality ใน
  // evolution.ts เปลี่ยนไปรับยอดนับอาหารแทนแล้ว ไม่ได้ทำหน้าที่ validate string นี้อีกต่อไป)
  if (choiceRaw !== "A" && choiceRaw !== "B") {
    throw new Error(`choosePersonalityAfterEvolve: บุคลิกไม่ถูกต้อง ต้องเป็น "A" หรือ "B" แต่ได้ "${choiceRaw}"`);
  }
  const requestedPersonality: Personality = choiceRaw;

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, stage, personality, subline, egg_type_id, math_correct, science_correct, combo_milestones")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (petError || !pet) throw new Error("ไม่พบ Qmon ที่กำลังเลี้ยงอยู่");
  if (pet.stage !== 4) throw new Error("Qmon ตัวนี้ยังไม่ถึงระยะ 4 เลือกบุคลิกไม่ได้");
  if (!pet.subline) throw new Error("Qmon ตัวนี้ยังไม่มี subline — ข้อมูลไม่ครบ คำนวณสเตตัสไม่ได้");

  let lockedPersonality: Personality;

  if (pet.personality) {
    // ล็อกไว้แล้วจากรอบก่อน (เช่น retry หลัง snapshot stat พังกลางทาง) — ห้ามเขียนทับด้วยค่าใหม่เด็ดขาด
    lockedPersonality = pet.personality as Personality;
  } else {
    // STEP 1: ล็อก personality ก่อน — WHERE personality is null กันสองคำขอชนกันล็อกคนละค่า
    const { data: lockedPet, error: lockError } = await supabase
      .from("pets")
      .update({ personality: requestedPersonality })
      .eq("id", pet.id)
      .is("personality", null)
      .select("id, personality")
      .single();

    if (lockError || !lockedPet || lockedPet.personality !== requestedPersonality) {
      throw new Error(
        "ล็อกบุคลิกไม่สำเร็จ — หยุดก่อนคำนวณสเตตัสเพื่อกันสเตตัสเพี้ยน: " + (lockError?.message ?? "ไม่ทราบสาเหตุ")
      );
    }
    lockedPersonality = requestedPersonality;
  }

  // STEP 1.5: อ่านย้อนยืนยันจาก DB จริง ไม่เชื่อ state ในตัวแปรเฉยๆ — นี่คือจุดกันสเตตัสเพี้ยนเงียบๆ
  const { data: verifyPet, error: verifyError } = await supabase
    .from("pets")
    .select("id, personality")
    .eq("id", pet.id)
    .single();

  if (verifyError || !verifyPet?.personality) {
    throw new Error(
      "ตรวจสอบบุคลิกที่ล็อกไม่สำเร็จ — ไม่คำนวณสเตตัสต่อ: " + (verifyError?.message ?? "personality ยังว่างอยู่ใน DB")
    );
  }
  if (verifyPet.personality !== lockedPersonality) {
    throw new Error(
      `บุคลิกใน DB ("${verifyPet.personality}") ไม่ตรงกับที่คาดไว้ ("${lockedPersonality}") — หยุดคำนวณสเตตัสทันที`
    );
  }

  // STEP 2: personality ยืนยันล็อกแล้วจริงใน DB — ตอนนี้ปลอดภัยที่จะ snapshot stat_*
  const { data: allAttempts } = await supabase
    .from("quiz_attempts")
    .select("is_correct")
    .eq("pet_id", pet.id);
  const totalAttempts = allAttempts?.length ?? 0;
  const totalCorrect = (allAttempts ?? []).filter((a) => a.is_correct).length;
  const accuracyPct = totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0;

  const { data: eggType, error: eggTypeError } = await supabase
    .from("egg_types")
    .select("stat_profile")
    .eq("id", pet.egg_type_id)
    .single();

  if (eggTypeError || !eggType?.stat_profile) {
    throw new Error(`ไม่พบ stat_profile ของ egg_type_id="${pet.egg_type_id}" — ตรวจสอบว่า egg_types มีข้อมูลนี้ครบ`);
  }

  const raw = computeRawStats({
    mathCorrect: pet.math_correct,
    scienceCorrect: pet.science_correct,
    accuracyPct,
    comboMilestones: pet.combo_milestones,
  });
  const finalStats = snapshotStats(raw, pet.subline as Subline, lockedPersonality, eggType.stat_profile);

  const { error: statError } = await supabase
    .from("pets")
    .update({
      stat_hp: finalStats.hp,
      stat_atk: finalStats.atk,
      stat_def: finalStats.def,
      stat_spd: finalStats.spd,
      stat_foc: finalStats.foc,
      evolved_at: new Date().toISOString(),
    })
    .eq("id", pet.id);

  if (statError) {
    throw new Error(
      "ล็อกบุคลิกสำเร็จแล้ว แต่บันทึกสเตตัสไม่สำเร็จ: " +
        statError.message +
        " — ลองใหม่อีกครั้ง (บุคลิกที่ล็อกไว้จะไม่เปลี่ยนเป็นค่าอื่น)"
    );
  }

  return { personality: lockedPersonality, stats: finalStats };
}

export type PersonalityFoodDecision = { decided: true; personality: Personality } | { decided: false };

// เช็คว่าตัดสิน personality จากอาหารสะสมได้เลยไหม (majority vote จาก pet_feedings) — เรียกคู่กับ
// getStageUpContext() ตอนเปิด PersonalityDecisionModal เสมอ คืน { decided: false } ทั้งกรณีเสมอกัน
// (รวม 0-0 ถ้าไม่เคยป้อนเลย) และกรณีไม่มีอะไรต้องตัดสิน (ไม่มี active pet ที่รอ/personality ล็อกไปแล้ว)
// — สองเคสนี้แยกกันไม่ออกจากผลลัพธ์ฟังก์ชันนี้เพียวๆ แต่ไม่ต้องแยก เพราะ getStageUpContext() คืน
// null ให้แยกเคสหลัง (ไม่มีอะไรต้องตัดสิน) ออกไปเองอยู่แล้วฝั่ง caller
export async function getPersonalityFoodDecision(): Promise<PersonalityFoodDecision> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const { data: pet } = await supabase
    .from("pets")
    .select("id, stage, personality")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!pet || pet.stage !== 4 || pet.personality) return { decided: false };

  const { data: feedings } = await supabase.from("pet_feedings").select("food_type").eq("pet_id", pet.id);

  const counts = { A: 0, B: 0 };
  for (const row of feedings ?? []) {
    if (row.food_type === "A") counts.A++;
    else if (row.food_type === "B") counts.B++;
  }

  const personality = determinePersonality(counts);
  return personality ? { decided: true, personality } : { decided: false };
}

export type FeedPetResult = { quantityRemaining: number };

// ป้อนอาหาร A/B ให้ pet ที่กำลังเลี้ยง — เฉพาะก่อน stage 4 เท่านั้น (RPC feed_pet เองไม่บังคับ stage
// แต่ปุ่มป้อนอาหารตัว stage 4 ยังไม่เปิด scope นี้ ต้องกันเองที่ชั้นนี้) เช็ค ownership +
// stage ก่อนเรียก RPC เสมอ ไม่ปล่อยให้ RPC เป็นด่านเดียว
export async function feedPet(petId: string, foodType: "A" | "B"): Promise<FeedPetResult> {
  if (foodType !== "A" && foodType !== "B") throw new Error("food_type ไม่ถูกต้อง");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, stage")
    .eq("id", petId)
    .eq("user_id", user.id)
    .single();

  if (petError || !pet) throw new Error("ไม่พบสัตว์เลี้ยงตัวนี้ของผู้ใช้");
  if (pet.stage >= 4) throw new Error("Qmon ตัวนี้โตเต็มที่แล้ว ป้อนอาหารเพื่อกำหนดบุคลิกไม่ได้อีก");

  const { data, error } = await supabase
    .rpc("feed_pet", { p_pet_id: petId, p_food_type: foodType, p_fed_date: getTodayInBangkok() })
    .single();

  if (error || !data) throw new Error(error?.message ?? "ป้อนอาหารไม่สำเร็จ");

  return { quantityRemaining: (data as { quantity_remaining: number }).quantity_remaining };
}
