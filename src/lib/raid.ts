import { redirect } from "next/navigation";
import { getUser, type createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";
import { computeRollDisplay, type RaidStatKey, type RaidStatRecord } from "@/lib/raid/stats";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RaidTypeInfo = {
  id: string;
  nameTh: string;
  descriptionTh: string | null;
  backgroundPath: string | null;
  obstacleCount: number;
  bossThresholdPct: number;
  bossQuestionCount: number;
  bossPassCount: number;
  bossNameTh: string | null;
};

export type EligibleRaidPet = {
  id: string;
  imagePath: string;
  speciesName: string;
  nickname: string | null;
  rawStats: RaidStatRecord;
  caps: RaidStatRecord;
};

export type RaidGearItemView = {
  id: string;
  slot: "head" | "body" | "feet";
  mainStat: RaidStatKey;
  mainValue: number;
  subStat: RaidStatKey | null;
  subValue: number | null;
  quality: string;
  qualityLabel: string | null;
};

// เหมือน RaidGearItemView แต่รวม equippedPetId ไว้ด้วย — ใช้เฉพาะฝั่งจอ predeparture ที่ต้องรู้ว่า
// ของชิ้นไหนใส่อยู่กับตัวไหน (null = อยู่ในคลัง ยังไม่ใส่ใคร) ต่างจาก RaidGearItemView ที่ใช้โชว์ของ
// รางวัลชิ้นเดียวตอนจบรอบซึ่งไม่ต้องรู้เรื่องนี้
export type RaidGearItemFull = RaidGearItemView & { equippedPetId: string | null };

export type RaidPathOption = {
  side: "a" | "b";
  obstacleNameTh: string;
  color: "green" | "yellow" | "red";
};

export type RaidView =
  | {
      phase: "predeparture";
      raidType: RaidTypeInfo;
      pets: EligibleRaidPet[];
      ticketCount: number;
      preselectedPetId: string | null;
      gearItems: RaidGearItemFull[];
    }
  | {
      phase: "choosing";
      runId: string;
      gaugeEarned: number;
      gaugeMax: number;
      stepIndex: number;
      obstacleCount: number;
      bossPassCount: number;
      bossQuestionCount: number;
      backgroundPath: string | null;
      petImagePath: string | null;
      options: RaidPathOption[];
    }
  | {
      phase: "quiz";
      runId: string;
      gaugeEarned: number;
      gaugeMax: number;
      stepIndex: number;
      obstacleCount: number;
      backgroundPath: string | null;
      petImagePath: string | null;
      revealedStat: RaidStatKey;
      revealedTh: string;
      // "ต้องทอยเกิน N" — กลับด้าน+การ์ดแล้วผ่าน computeRollDisplay จุดเดียวกับตอนทอยสด ล็อกไว้ตั้งแต่
      // ตอนทอยจริง (choose_raid_path) โชว์ตรงๆ ตอน resume ไม่ต้อง animate ซ้ำ (ผลลัพธ์ล็อกตอนที่มันเกิด
      // ไม่ใช่ตอนที่มาดู)
      displayNeed: number;
      displayRoll: number;
      isGuaranteedPass: boolean;
      question: { id: number; questionText: string; choices: string[] };
    }
  | {
      phase: "boss";
      runId: string;
      gaugeEarned: number;
      gaugeMax: number;
      bossPassCount: number;
      bossQuestionCount: number;
      bossNameTh: string | null;
      backgroundPath: string | null;
      bossSpritePath: string | null;
      petImagePath: string | null;
      thresholdPct: number;
      questions: {
        seq: number;
        questionId: number;
        questionText: string;
        choices: string[];
        answered: boolean;
        isCorrect: boolean | null;
      }[];
    }
  | {
      phase: "reward";
      runId: string;
      outcome: "win" | "lose_stat" | "lose_quiz";
      backgroundPath: string | null;
      gearItem: RaidGearItemView | null;
    };

export async function isRaidAllowlisted(supabase: SupabaseServerClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("raid_allowlist").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function getRaidTicketCount(supabase: SupabaseServerClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("raid_tickets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("consumed_at", null);
  return count ?? 0;
}

// ด่านที่เปิดใช้งานอยู่ — v1 มีแถวเดียว (easy) แต่คิวรีเผื่ออนาคตมีหลายแถวเหมือน getActiveDungeon
export async function getActiveRaidType(supabase: SupabaseServerClient): Promise<RaidTypeInfo | null> {
  const { data } = await supabase
    .from("raid_types")
    .select(
      "id, name_th, description_th, background_path, obstacle_count, boss_threshold_pct, boss_question_count, boss_pass_count, boss_name_th"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    nameTh: data.name_th,
    descriptionTh: data.description_th,
    backgroundPath: data.background_path,
    obstacleCount: data.obstacle_count,
    bossThresholdPct: data.boss_threshold_pct,
    bossQuestionCount: data.boss_question_count,
    bossPassCount: data.boss_pass_count,
    bossNameTh: data.boss_name_th,
  };
}

// ด่านหนึ่งใบระบุด้วย slug (ใช้แทน getActiveRaidType() ใน /raid/[slug]/page.tsx ตั้งแต่มีหลายด่าน)
export async function getRaidTypeBySlug(
  supabase: SupabaseServerClient,
  slug: string
): Promise<RaidTypeInfo | null> {
  const { data } = await supabase
    .from("raid_types")
    .select(
      "id, name_th, description_th, background_path, obstacle_count, boss_threshold_pct, boss_question_count, boss_pass_count, boss_name_th"
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    nameTh: data.name_th,
    descriptionTh: data.description_th,
    backgroundPath: data.background_path,
    obstacleCount: data.obstacle_count,
    bossThresholdPct: data.boss_threshold_pct,
    bossQuestionCount: data.boss_question_count,
    bossPassCount: data.boss_pass_count,
    bossNameTh: data.boss_name_th,
  };
}

export type RaidZoneWithLevels = {
  zoneId: string;
  zoneSlug: string;
  zoneName: string;
  levels: RaidLevelSummary[];
};

export type RaidLevelSummary = {
  id: string;
  slug: string;
  nameTh: string;
  bossNameTh: string | null;
  backgroundPath: string | null;
  bossThresholdPct: number;
  sortOrder: number;
  cleared: boolean;
  unlocked: boolean;
};

// ทุกโซนที่ active พร้อมด่านในโซนนั้น แต่ละด่านมี cleared/unlocked ต่อ user — unlock gate เป็นระดับ
// บัญชี (เช็คจาก raid_runs.outcome='win' ของ user_id เท่านั้น ไม่สน pet_id) คนละกลไกกับ readiness
// gauge ในจอ predeparture ที่เช็คว่า Qmon+อุปกรณ์ชุดนี้พร้อมด่านนี้ไหม (มีอยู่แล้ว ไม่แตะ)
export async function getRaidZonesWithLevels(
  supabase: SupabaseServerClient,
  userId: string
): Promise<RaidZoneWithLevels[]> {
  const [{ data: zones }, { data: types }, { data: wins }] = await Promise.all([
    supabase.from("zones").select("id, slug, name_th, sort_order").eq("is_active", true).order("sort_order"),
    supabase
      .from("raid_types")
      .select("id, slug, name_th, boss_name_th, background_path, boss_threshold_pct, sort_order, zone_id")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("raid_runs").select("raid_type_id").eq("user_id", userId).eq("outcome", "win"),
  ]);

  const clearedIds = new Set((wins ?? []).map((w) => w.raid_type_id));

  return (zones ?? []).map((zone) => {
    const levelsInZone = (types ?? [])
      .filter((t) => t.zone_id === zone.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    let previousCleared = true; // ด่านแรกของโซนปลดล็อกเสมอ
    const levels: RaidLevelSummary[] = levelsInZone.map((t) => {
      const cleared = clearedIds.has(t.id);
      const unlocked = previousCleared;
      previousCleared = cleared;
      return {
        id: t.id,
        slug: t.slug,
        nameTh: t.name_th,
        bossNameTh: t.boss_name_th,
        backgroundPath: t.background_path,
        bossThresholdPct: Number(t.boss_threshold_pct),
        sortOrder: t.sort_order,
        cleared,
        unlocked,
      };
    });

    return { zoneId: zone.id, zoneSlug: zone.slug, zoneName: zone.name_th, levels };
  });
}

// auth + allowlist ในจุดเดียว ให้ /raid/page.tsx กับ /raid/[slug]/page.tsx เรียกร่วมกัน กันลืมเช็คซ้ำรอย
// บั๊กเดิม (ปุ่ม "กลับไปต่อ" เคยหลุดผ่านทั้งที่หน้าปิดอยู่) — redirect() throw ออกจาก helper ได้ปกติ
export async function requireRaidAccess(supabase: SupabaseServerClient): Promise<{ id: string }> {
  const user = await getUser();
  if (!user) redirect("/login");
  const allowed = await isRaidAllowlisted(supabase, user.id);
  if (!allowed) redirect("/pet");
  return user;
}

type EggTypeJoin = { sprite_prefix: string; name_th: string; stat_profile: { caps?: RaidStatRecord } | null };
function pickEggType(joined: EggTypeJoin | EggTypeJoin[] | null): EggTypeJoin | null {
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

// pet ที่ท้าทายได้ — stage >= 4 เท่านั้น ห้ามกรอง is_active (pet stage 4 ทุกตัวเก็บเข้าคอลเลกชันแล้ว
// เป็น is_active=false ทั้งหมด กรอง active จะทำให้ว่างเปล่าทั้งระบบ — ต่างจาก getEligiblePets ของ
// ผจญภัยโดยตั้งใจ ห้ามลอกเงื่อนไขนั้นมา)
// สไลซ์ 2: ดึง rawStats + caps มาด้วย ใช้คำนวณ readiness ของจอ predeparture ผ่าน effectiveStat()
// เท่านั้น (ห้ามอ่าน stat_* ตรงๆ ในฝั่ง UI) — ไม่ใช่ตัวตัดสินผ่าน/ไม่ผ่านจริง (นั่นมาจาก stat_snapshot
// ที่ start_raid_run ล็อกไว้ตอนเริ่มรอบ)
export async function getEligibleRaidPets(
  supabase: SupabaseServerClient,
  userId: string
): Promise<EligibleRaidPet[]> {
  const { data } = await supabase
    .from("pets")
    .select(
      "id, nickname, hatched_at, stage, subline, personality, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, egg_types(sprite_prefix, name_th, stat_profile)"
    )
    .eq("user_id", userId)
    .gte("stage", 4)
    .order("hatched_at", { ascending: false });

  const pets: EligibleRaidPet[] = [];
  for (const row of data ?? []) {
    const eggType = pickEggType(row.egg_types as EggTypeJoin | EggTypeJoin[] | null);
    const caps = eggType?.stat_profile?.caps;
    if (!eggType || !row.subline || !row.personality || !caps) continue;
    try {
      pets.push({
        id: row.id,
        nickname: row.nickname,
        imagePath: getPetImagePath(eggType.sprite_prefix, 4, row.subline as Subline, row.personality as Personality),
        speciesName: getSpeciesName(
          eggType.sprite_prefix,
          4,
          row.subline as Subline,
          row.personality as Personality,
          eggType.name_th
        ),
        rawStats: {
          hp: row.stat_hp ?? 0,
          atk: row.stat_atk ?? 0,
          def: row.stat_def ?? 0,
          spd: row.stat_spd ?? 0,
          foc: row.stat_foc ?? 0,
        },
        caps,
      });
    } catch (err) {
      console.error("getEligibleRaidPets: skip pet with bad data", row.id, err);
    }
  }
  return pets;
}

type QualityJoin = { label_th: string };
function pickQualityLabel(joined: QualityJoin | QualityJoin[] | null): string | null {
  const row = Array.isArray(joined) ? (joined[0] ?? null) : joined;
  return row?.label_th ?? null;
}

// อุปกรณ์ทั้งหมดที่ user เป็นเจ้าของ (ทั้งที่ใส่อยู่กับตัวไหนก็ตามและที่อยู่ในคลัง) — จอ predeparture
// ใช้กรอง equippedPetId ตรงกับ pet ที่เลือกไว้เอง ไม่ query แยกต่อตัว
export async function getUserRaidGearItems(
  supabase: SupabaseServerClient,
  userId: string
): Promise<RaidGearItemFull[]> {
  const { data } = await supabase
    .from("raid_gear_items")
    .select(
      "id, slot, main_stat, main_value, sub_stat, sub_value, quality, equipped_pet_id, raid_gear_qualities(label_th)"
    )
    .eq("owner_user_id", userId)
    .order("obtained_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    slot: row.slot as "head" | "body" | "feet",
    mainStat: row.main_stat as RaidStatKey,
    mainValue: row.main_value,
    subStat: row.sub_stat as RaidStatKey | null,
    subValue: row.sub_value,
    quality: row.quality,
    qualityLabel: pickQualityLabel(row.raid_gear_qualities as QualityJoin | QualityJoin[] | null),
    equippedPetId: row.equipped_pet_id,
  }));
}

type RunRow = {
  id: string;
  raid_type_id: string;
  pet_id: string;
  phase: string;
  status: string;
  current_step_index: number;
  gauge_earned: number;
  gauge_max: number;
  threshold_pct: number;
  outcome: string | null;
  gear_item_id: string | null;
};

// รันที่กำลังเล่นอยู่ของ user แปลงเป็น view ที่ปลอดภัยส่งให้ client — raid_run_steps มีข้อมูลเฉลย
// (option_*_obstacle_id/stat) ที่ห้ามให้เห็นก่อนเวลา ฟังก์ชันนี้เป็นจุดเดียวที่อ่านตารางดิบแล้วกรอง
// ฟิลด์ก่อนส่งต่อ (ดู §3.5 ในดอค) — ส่ง stat ของอุปสรรคที่เลือกแล้วเท่านั้น ไม่ส่งของทางที่ไม่ได้เลือก
export async function getActiveRaidRun(supabase: SupabaseServerClient, userId: string): Promise<RaidView | null> {
  const { data: run } = await supabase
    .from("raid_runs")
    .select(
      "id, raid_type_id, pet_id, phase, status, current_step_index, gauge_earned, gauge_max, threshold_pct, outcome, gear_item_id"
    )
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle<RunRow>();

  if (!run) return null;

  const { data: raidType } = await supabase
    .from("raid_types")
    .select("obstacle_count, boss_question_count, boss_pass_count, boss_name_th, background_path, boss_sprite_path")
    .eq("id", run.raid_type_id)
    .single();
  if (!raidType) return null;

  // sprite Qmon ในฉาก — คำนวณครั้งเดียวใช้ร่วมกันทุก phase (choosing/quiz/boss) ไม่มี UI ตัวไหน
  // ต้องเห็น pet_id ตรงๆ แค่ path รูป — พังเงียบๆ เป็น null ถ้าข้อมูล pet ไม่ครบ (ไม่ทำให้ทั้งจอ error)
  let petImagePath: string | null = null;
  {
    const { data: pet } = await supabase
      .from("pets")
      .select("subline, personality, egg_types(sprite_prefix, name_th)")
      .eq("id", run.pet_id)
      .maybeSingle();
    const eggType = pickEggType(pet?.egg_types as EggTypeJoin | EggTypeJoin[] | null);
    if (pet && eggType && pet.subline && pet.personality) {
      try {
        petImagePath = getPetImagePath(eggType.sprite_prefix, 4, pet.subline as Subline, pet.personality as Personality);
      } catch {
        petImagePath = null;
      }
    }
  }

  if (run.phase === "choosing" || run.phase === "quiz") {
    const { data: step } = await supabase
      .from("raid_run_steps")
      .select(
        "option_a_obstacle_id, option_a_color, option_b_obstacle_id, option_b_color, chosen_side, quiz_question_id, roll_value, roll_threshold, roll_passed"
      )
      .eq("run_id", run.id)
      .eq("step_index", run.current_step_index)
      .maybeSingle();
    if (!step) return null;

    if (run.phase === "choosing") {
      const { data: obstacles } = await supabase
        .from("raid_obstacles")
        .select("id, name_th")
        .in("id", [step.option_a_obstacle_id, step.option_b_obstacle_id]);
      const nameById = new Map((obstacles ?? []).map((o) => [o.id, o.name_th]));

      return {
        phase: "choosing",
        runId: run.id,
        gaugeEarned: run.gauge_earned,
        gaugeMax: run.gauge_max,
        stepIndex: run.current_step_index,
        obstacleCount: raidType.obstacle_count,
        bossPassCount: raidType.boss_pass_count,
        bossQuestionCount: raidType.boss_question_count,
        backgroundPath: raidType.background_path,
        petImagePath,
        options: [
          {
            side: "a",
            obstacleNameTh: nameById.get(step.option_a_obstacle_id) ?? "",
            color: step.option_a_color as "green" | "yellow" | "red",
          },
          {
            side: "b",
            obstacleNameTh: nameById.get(step.option_b_obstacle_id) ?? "",
            color: step.option_b_color as "green" | "yellow" | "red",
          },
        ],
      };
    }

    // phase === "quiz" — เฉลย stat ของทางที่เลือกแล้วเท่านั้น (chosen_side ถูกบันทึกไปแล้วก่อนหน้านี้)
    const chosenObstacleId = step.chosen_side === "a" ? step.option_a_obstacle_id : step.option_b_obstacle_id;
    const { data: obstacle } = await supabase
      .from("raid_obstacles")
      .select("stat, reveal_th")
      .eq("id", chosenObstacleId)
      .single();
    if (!obstacle || step.quiz_question_id === null) return null;

    const admin = createAdminClient();
    const { data: question } = await admin
      .from("questions")
      .select("id, question_text, choices")
      .eq("id", step.quiz_question_id)
      .single();
    if (!question) return null;

    return {
      phase: "quiz",
      runId: run.id,
      gaugeEarned: run.gauge_earned,
      gaugeMax: run.gauge_max,
      stepIndex: run.current_step_index,
      obstacleCount: raidType.obstacle_count,
      backgroundPath: raidType.background_path,
      petImagePath,
      revealedStat: obstacle.stat as RaidStatKey,
      revealedTh: obstacle.reveal_th,
      // ล็อกไว้แล้วตั้งแต่ทอยจริงใน choose_raid_path (step นี้ resolve แล้วเสมอตอนเข้า phase quiz —
      // roll_passed เป็น false เสมอในสาขานี้โดยโครงสร้าง RPC แต่ยังอ่านจริงจาก DB แทนสมมติเอาเอง)
      ...computeRollDisplay(
        Math.round((step.roll_value ?? 0) * 100),
        Math.round((step.roll_threshold ?? 0) * 100),
        step.roll_passed ?? false
      ),
      question: { id: question.id, questionText: question.question_text, choices: question.choices },
    };
  }

  if (run.phase === "boss") {
    const { data: bossQuestions } = await supabase
      .from("raid_boss_questions")
      .select("seq, question_id, answered_at, is_correct")
      .eq("run_id", run.id)
      .order("seq", { ascending: true });

    let questionMap = new Map<number, { question_text: string; choices: string[] }>();
    if (bossQuestions && bossQuestions.length > 0) {
      const admin = createAdminClient();
      const { data: qs } = await admin
        .from("questions")
        .select("id, question_text, choices")
        .in("id", bossQuestions.map((b) => b.question_id));
      questionMap = new Map((qs ?? []).map((q) => [q.id, { question_text: q.question_text, choices: q.choices }]));
    }

    return {
      phase: "boss",
      runId: run.id,
      gaugeEarned: run.gauge_earned,
      gaugeMax: run.gauge_max,
      bossPassCount: raidType.boss_pass_count,
      bossQuestionCount: raidType.boss_question_count,
      bossNameTh: raidType.boss_name_th,
      backgroundPath: raidType.background_path,
      bossSpritePath: raidType.boss_sprite_path,
      petImagePath,
      thresholdPct: run.threshold_pct,
      questions: (bossQuestions ?? []).map((b) => ({
        seq: b.seq,
        questionId: b.question_id,
        questionText: questionMap.get(b.question_id)?.question_text ?? "",
        choices: questionMap.get(b.question_id)?.choices ?? [],
        answered: b.answered_at !== null,
        isCorrect: b.is_correct,
      })),
    };
  }

  // phase === "reward" (ทั้งก่อนและหลังกด "รับของ" — ก่อนรับ gear_item_id ยังเป็น null)
  let gearItem: RaidGearItemView | null = null;
  if (run.gear_item_id) {
    // join raid_gear_qualities เอา label_th (แสงริบหรี่/นวล/จ้า/เจิดจ้า) มาโชว์แทน code ดิบ
    // (q1-q4) — ไม่แตะ claim_raid_reward RPC เลย แค่อ่านเพิ่มตอนโหลด view
    const { data: gear } = await supabase
      .from("raid_gear_items")
      .select("id, slot, main_stat, main_value, sub_stat, sub_value, quality, raid_gear_qualities(label_th)")
      .eq("id", run.gear_item_id)
      .single();
    if (gear) {
      const qualityRow = Array.isArray(gear.raid_gear_qualities)
        ? gear.raid_gear_qualities[0]
        : gear.raid_gear_qualities;
      gearItem = {
        id: gear.id,
        slot: gear.slot,
        mainStat: gear.main_stat,
        mainValue: gear.main_value,
        subStat: gear.sub_stat,
        subValue: gear.sub_value,
        quality: gear.quality,
        qualityLabel: qualityRow?.label_th ?? null,
      };
    }
  }

  return {
    phase: "reward",
    runId: run.id,
    outcome: run.outcome as "win" | "lose_stat" | "lose_quiz",
    backgroundPath: raidType.background_path,
    gearItem,
  };
}

export type RaidEntryState =
  | { status: "not_allowlisted" }
  | { status: "no_ticket" }
  | { status: "ready"; ticketCount: number }
  | { status: "own_run" }
  | { status: "blocked_other_pet"; otherPetName: string };

// สถานะปุ่ม "ส่งไปท้าทาย" สำหรับ Qmon ตัวหนึ่งโดยเฉพาะ (ใช้ใน /collection/[petId]) — เช่นเดียวกับ
// getDungeonEntryState ของฝั่งผจญภัย: concurrency เป็นต่อ user ต้องแยก own_run กับ blocked_other_pet
export async function getRaidEntryState(
  supabase: SupabaseServerClient,
  userId: string,
  petId: string
): Promise<RaidEntryState> {
  const allowed = await isRaidAllowlisted(supabase, userId);
  if (!allowed) return { status: "not_allowlisted" };

  const { data: run } = await supabase
    .from("raid_runs")
    .select("pet_id")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (run) {
    if (run.pet_id === petId) return { status: "own_run" };

    // ชื่อที่โชว์: nickname ก่อนเสมอ (nullable) fallback เป็นชื่อพันธุ์ที่คำนวณจาก egg/subline/personality
    const { data: otherPet } = await supabase
      .from("pets")
      .select("nickname, subline, personality, egg_types(sprite_prefix, name_th)")
      .eq("id", run.pet_id)
      .maybeSingle();

    let otherPetName = "Qmon ตัวอื่น";
    if (otherPet?.nickname) {
      otherPetName = otherPet.nickname;
    } else if (otherPet) {
      const eggType = pickEggType(otherPet.egg_types as EggTypeJoin | EggTypeJoin[] | null);
      if (eggType && otherPet.subline && otherPet.personality) {
        try {
          otherPetName = getSpeciesName(
            eggType.sprite_prefix,
            4,
            otherPet.subline as Subline,
            otherPet.personality as Personality,
            eggType.name_th
          );
        } catch {
          // คำนวณชื่อพันธุ์พัง (ข้อมูลตัวอื่นไม่ครบ) — เก็บ fallback "Qmon ตัวอื่น" ไว้
        }
      }
    }

    return { status: "blocked_other_pet", otherPetName };
  }

  const ticketCount = await getRaidTicketCount(supabase, userId);
  if (ticketCount === 0) return { status: "no_ticket" };
  return { status: "ready", ticketCount };
}
