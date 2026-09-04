import { createClient, getUser } from "@/lib/supabase/server";
import {
  STAGE_EXP_THRESHOLD,
  STAGE_LABEL_TH,
  tryAdvanceStage,
  type Subline,
  type Personality,
} from "@/lib/evolution";
import { evolvePet } from "@/lib/petEvolution";
import { getSpeciesName } from "@/lib/petLine";
import { getPetImagePath } from "@/lib/petImage";
import { DAILY_EXP_CAP, getTodayInBangkok } from "@/lib/exp";
import { getWeeklyJourney, type JourneyDay } from "@/lib/weeklyJourney";
import { getMyWeeklyRank, type MyWeeklyRank } from "@/lib/weeklyLeaderboard";
import { getGradeBand, type GradeBand } from "@/lib/gradeBand";
import { getWeeklyTopicStats, type TopicStatsResult } from "@/lib/topicStats";
import { getOrCreateTodayMission, type TodayMissionResult } from "@/lib/missions";
import { getPlayerFoodInventory, type FoodInventory } from "@/lib/food";
import { getPersonalityKey } from "@/lib/personality";
import { getDungeonCardState, type DungeonCardState } from "@/lib/dungeon";
import { getRaidTicketCount } from "@/lib/raid";
import Link from "next/link";
import WeeklyRewardCelebration from "@/components/WeeklyRewardCelebration";
import PetCard from "@/components/PetCard";
import PendingPersonalityCard from "@/components/PendingPersonalityCard";
import TrackOnMount from "@/components/TrackOnMount";
import type { EggChoice } from "@/components/EggChoiceModal";
import EggsClient, { type EggListItem } from "@/components/EggsClient";

export default async function PetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { evolved } = await searchParams;
  const justEvolved = evolved === "1";

  const supabase = await createClient();
  const user = await getUser();

  let pet: {
    id: string;
    nickname: string | null;
    exp: number;
    stage: number;
    subline: string | null;
    personality: string | null;
    stat_hp: number | null;
    stat_atk: number | null;
    stat_def: number | null;
    stat_spd: number | null;
    stat_foc: number | null;
    exp_today: number;
    exp_today_date: string;
    math_correct: number;
    science_correct: number;
    combo_milestones: number;
    egg_types:
      | { sprite_prefix: string; name_th: string }
      | { sprite_prefix: string; name_th: string }[]
      | null;
  } | null = null;

  let eggChoices: EggChoice[] = [];
  let journeyDays: JourneyDay[] = [];
  let topicStats: TopicStatsResult = {
    hasAnyData: false,
    needsPractice: [],
    strong: [],
    notEnoughData: [],
  };
  let mission: TodayMissionResult | null = null;
  let foodInventory: FoodInventory = { A: 0, B: 0 };
  let myWeeklyRank: MyWeeklyRank = { hasRank: false };
  let gradeBand: GradeBand | null = null;
  let dungeonCard: DungeonCardState = { status: "invite" };
  let hasEverAnswered = false;
  let unhatchedEggs: EggListItem[] = [];
  let raidTicketCount = 0;

  if (user) {
    // ดึงครั้งเดียว ใช้ทั้งเป็น prop ให้ PetCard (label กลุ่มบน WeeklyLeaderboardCard) และป้อนเข้า
    // getMyWeeklyRank ด้านล่าง — .catch เผื่อไว้ (getGradeBand เองไม่ throw อยู่แล้ว แต่กันไว้อีกชั้น
    // ไม่ให้ Promise.all ทั้งก้อนพังถ้ามีอะไรผิดปกติจริงๆ) อ้าง promise เดิมซ้ำสองที่ด้านล่างไม่ทำให้
    // ยิง query ซ้ำ (resolved ค่าเดิมจากที่เดียว)
    const gradeBandPromise = getGradeBand(user.id).catch(() => "junior" as GradeBand);

    const [
      { data },
      { data: eggTypeRows },
      journeyResult,
      topicStatsResult,
      missionResult,
      foodResult,
      myWeeklyRankResult,
      gradeBandResult,
      dungeonCardResult,
      { data: hasAnsweredRows },
      raidTicketCountResult,
    ] = await Promise.all([
      supabase
        .from("pets")
        .select(
          "id, nickname, exp, stage, subline, personality, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, exp_today, exp_today_date, math_correct, science_correct, combo_milestones, egg_types(sprite_prefix, name_th)"
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("egg_types")
        .select("id, name_th, tier, description, sprite_prefix")
        .eq("is_obtainable", true)
        .eq("tier", "common")
        .order("id", { ascending: true }),
      getWeeklyJourney(supabase, user.id),
      getWeeklyTopicStats(supabase, user.id),
      // จับ error เองตรงนี้ (ไม่ปล่อยให้ throw ทะลุ Promise.all) — ภารกิจเลือกบทพังไม่ควรทำให้
      // ทั้งหน้า /pet ล่มไปด้วย (regression หลักคือ pet/EXP/สถิติ ต้องขึ้นได้เสมอแม้การ์ดภารกิจหาย)
      getOrCreateTodayMission(supabase, user.id).catch((err) => {
        console.error("getOrCreateTodayMission failed:", err);
        return null;
      }),
      getPlayerFoodInventory(supabase, user.id),
      // เช่นเดียวกับภารกิจ — การ์ด leaderboard เป็นของเสริม พังไม่ควรทำทั้งหน้า /pet ล่ม
      // ต้องรู้ grade_band ก่อนถึงจะเรียก getMyWeeklyRank ได้ (RPC overload ใหม่ไม่มี default
      // ต้องส่ง p_grade_band เสมอ) — หน้านี้ไม่เคย query profiles เลย ใช้ getGradeBand() ตัวเดิม
      // ที่ quiz/actions.ts และ missions.ts ใช้อยู่แล้วแทนการ query เอง (อ่านผ่าน admin client
      // กัน RLS ของ profiles คืน null เงียบๆ ตามที่ src/lib/gradeBand.ts เตือนไว้)
      gradeBandPromise
        .then((band) => getMyWeeklyRank(supabase, user.id, band))
        .catch((err) => {
          console.error("getMyWeeklyRank failed:", err);
          return { hasRank: false } as MyWeeklyRank;
        }),
      // phase 3: PetCard ต้อง gradeBand ไปโชว์ label กลุ่มบน WeeklyLeaderboardCard ด้วย —
      // reuse promise เดียวกับด้านบน (ดูคอมเมนต์ต้นบล็อก)
      gradeBandPromise,
      // phase 4: การ์ดผจญภัย — พังไม่ควรทำทั้งหน้า /pet ล่ม เช่นเดียวกับภารกิจ/leaderboard ข้างบน
      getDungeonCardState(supabase, user.id).catch((err) => {
        console.error("getDungeonCardState failed:", err);
        return { status: "invite" } as DungeonCardState;
      }),
      // เช็คว่าเคยตอบคำถามมาก่อนไหม (ไม่จำกัดช่วงเวลา) — กันการ์ดภารกิจโผล่ก่อน user ใหม่ได้ลองตอบ
      // สักข้อ (ดู PetCard.tsx missionActive) เลือก .select("id").limit(1) ไม่ใช้ count:"exact"
      // เพราะ user เก่าบางคนมี quiz_attempts หลักพันแถว ไม่ต้องนับทั้งตารางแค่เช็คว่ามี/ไม่มี
      supabase.from("quiz_attempts").select("id").eq("user_id", user.id).limit(1),
      // แถบด่วนบน sticky banner ต้องรู้จำนวนกุญแจท้าทาย — พังไม่ควรทำทั้งหน้า /pet ล่ม เช่นเดียวกับ
      // ของเสริมตัวอื่นๆ ข้างบน
      getRaidTicketCount(supabase, user.id).catch((err) => {
        console.error("getRaidTicketCount failed:", err);
        return 0;
      }),
    ]);
    pet = data;
    journeyDays = journeyResult;
    topicStats = topicStatsResult;
    mission = missionResult;
    foodInventory = foodResult;
    myWeeklyRank = myWeeklyRankResult;
    gradeBand = gradeBandResult;
    dungeonCard = dungeonCardResult;
    hasEverAnswered = (hasAnsweredRows?.length ?? 0) > 0;
    raidTicketCount = raidTicketCountResult;
    eggChoices = (eggTypeRows ?? []).map((egg) => ({
      id: egg.id,
      nameTh: egg.name_th,
      tier: egg.tier,
      description: egg.description,
      imagePath: getPetImagePath(egg.sprite_prefix, 1, null, null),
    }));

    // ไม่มี active pet ตอนนี้ — ดึงไข่ที่ยังไม่ฟักมาให้เลือกฟักตรงนี้เลย (ไม่ต้อง fetch
    // ตอนมี pet active อยู่แล้ว เพราะ empty state จะไม่ได้โชว์อยู่ดี)
    if (!pet) {
      const { data: eggRows } = await supabase
        .from("player_eggs")
        .select(
          "id, source, obtained_at, egg_type_id, egg_types(name_th, tier, description, sprite_prefix)"
        )
        .eq("user_id", user.id)
        .is("hatched_at", null)
        .order("obtained_at", { ascending: true });

      unhatchedEggs = (eggRows ?? []).map((row) => {
        const eggType = Array.isArray(row.egg_types) ? row.egg_types[0] : row.egg_types;
        return {
          id: row.id,
          source: row.source,
          obtainedAt: row.obtained_at,
          eggTypeId: row.egg_type_id,
          nameTh: eggType?.name_th ?? row.egg_type_id,
          tier: eggType?.tier ?? "common",
          description: eggType?.description ?? null,
          imagePath: eggType ? getPetImagePath(eggType.sprite_prefix, 1, null, null) : null,
        };
      });
    }
  }

  // safety net (สไลซ์ 3): PvP ให้ EXP ตัว active ตรง ๆ ใน SQL โดยไม่เช็ค stage-up (option B) —
  // ถ้า exp ข้าม threshold แล้วแต่ stage ยังไม่ขยับ (เช่นปิดแอปตอนแมตช์จบ ไม่ได้เปิดหน้าแมตช์) reconcile ที่นี่
  if (user && pet && tryAdvanceStage(pet.stage, pet.exp) !== pet.stage) {
    await evolvePet(
      supabase,
      user.id,
      { id: pet.id, stage: pet.stage, math_correct: pet.math_correct, science_correct: pet.science_correct },
      pet.exp,
      "/pet"
    );
    const { data: fresh } = await supabase
      .from("pets")
      .select(
        "id, nickname, exp, stage, subline, personality, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, exp_today, exp_today_date, math_correct, science_correct, combo_milestones, egg_types(sprite_prefix, name_th)"
      )
      .eq("id", pet.id)
      .maybeSingle();
    if (fresh) pet = fresh;
  }

  const exp = pet?.exp ?? 0;
  const stage = pet?.stage ?? 1;
  const stageInfo = STAGE_LABEL_TH[stage] ?? STAGE_LABEL_TH[1];
  const subline = pet?.subline;
  const personality = pet?.personality;
  const personalityKey = getPersonalityKey(stage, subline ?? null);
  const statHp = pet?.stat_hp ?? null;
  const statAtk = pet?.stat_atk ?? null;
  const statDef = pet?.stat_def ?? null;
  const statSpd = pet?.stat_spd ?? null;
  const statFoc = pet?.stat_foc ?? null;
  const mathCorrect = pet?.math_correct ?? 0;
  const scienceCorrect = pet?.science_correct ?? 0;
  const comboMilestones = pet?.combo_milestones ?? 0;

  // stage 4 แต่ personality ยัง null = ปิดแอป/รีเฟรชกลางคันก่อนตอบคำถามเลือกบุคลิก (StageUpModal)
  // ต้องกันไว้ตรงนี้ก่อนคำนวณ petImagePath/speciesName ต่อ — ไม่งั้นโชว์เรดาร์/รูปเพี้ยนได้
  const needsPersonalityChoice = !!pet && stage === 4 && !personality;

  const nextThreshold = STAGE_EXP_THRESHOLD[stage];
  const progress = nextThreshold ? Math.min(1, Math.max(0, exp / nextThreshold)) : 1;

  const expToday = pet && pet.exp_today_date === getTodayInBangkok() ? pet.exp_today : 0;

  const eggType = pet ? (Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types) : null;
  let petImagePath: string | null = null;
  let speciesName: string | null = null;
  // ข้ามตอนรอเลือกบุคลิก — subline มีแล้วแต่ personality ยัง null ตั้งใจ ไม่ใช่ข้อมูลพัง
  // เรียก getPetImagePath/getSpeciesName ไปก็ throw (ต้องการ personality ที่ stage 4) เปล่าๆ
  if (eggType && !needsPersonalityChoice) {
    try {
      petImagePath = getPetImagePath(
        eggType.sprite_prefix,
        stage,
        (subline ?? null) as Subline | null,
        (personality ?? null) as Personality | null
      );
    } catch (err) {
      console.error(err);
    }
    try {
      speciesName = getSpeciesName(
        eggType.sprite_prefix,
        stage,
        (subline ?? null) as Subline | null,
        (personality ?? null) as Personality | null,
        eggType.name_th
      );
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      {user && <WeeklyRewardCelebration />}
      {pet && needsPersonalityChoice ? (
        <PendingPersonalityCard />
      ) : pet ? (
        <>
        <TrackOnMount event="pet_detail_open" props={{ source: "active" }} petId={pet.id} />
        <PetCard
          petId={pet.id}
          stage={stage}
          stageName={stageInfo.name}
          stageDescription={stageInfo.description}
          exp={exp}
          nextThreshold={nextThreshold}
          progress={progress}
          nickname={pet.nickname}
          speciesName={speciesName}
          petImagePath={petImagePath}
          personalityKey={personalityKey}
          statHp={statHp}
          statAtk={statAtk}
          statDef={statDef}
          statSpd={statSpd}
          statFoc={statFoc}
          mathCorrect={mathCorrect}
          scienceCorrect={scienceCorrect}
          comboMilestones={comboMilestones}
          expToday={expToday}
          dailyCap={DAILY_EXP_CAP}
          justEvolved={justEvolved}
          eggChoices={eggChoices}
          journeyDays={journeyDays}
          topicStats={topicStats}
          mission={mission}
          hasEverAnswered={hasEverAnswered}
          myWeeklyRank={myWeeklyRank}
          gradeBand={gradeBand}
          subline={(subline ?? null) as Subline | null}
          foodA={foodInventory.A}
          foodB={foodInventory.B}
          dungeonCard={dungeonCard}
          raidTicketCount={raidTicketCount}
        />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-gold-dim bg-card p-4 text-center">
            <p className="text-sm font-bold text-gold-hi">ยังไม่มี Qmon ที่กำลังเลี้ยงอยู่</p>
            <p className="mt-1 text-xs text-text3">เลือกไข่ที่จะฟักได้เลย</p>
            <Link href="/settings" className="mt-2 inline-block text-xs text-text3 underline underline-offset-2">
              ตั้งค่า
            </Link>
          </div>
          <EggsClient eggs={unhatchedEggs} hasActivePet={false} />
        </div>
      )}
    </main>
  );
}
