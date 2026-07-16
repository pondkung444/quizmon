import { createClient, getUser } from "@/lib/supabase/server";
import {
  STAGE_EXP_THRESHOLD,
  STAGE_LABEL_TH,
  getSpeciesName,
  type Subline,
  type Personality,
} from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import { DAILY_EXP_CAP, getTodayInBangkok } from "@/lib/exp";
import { getWeeklyJourney, type JourneyDay } from "@/lib/weeklyJourney";
import { getWeeklyTopicStats, type TopicStatsResult } from "@/lib/topicStats";
import { getPersonalityKey } from "@/lib/personality";
import SignOutLink from "@/components/SignOutLink";
import PetCard from "@/components/PetCard";
import PendingPersonalityCard from "@/components/PendingPersonalityCard";
import TrackOnMount from "@/components/TrackOnMount";
import type { EggChoice } from "@/components/EggChoiceModal";

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

  if (user) {
    const [{ data }, { data: eggTypeRows }, journeyResult, topicStatsResult] = await Promise.all([
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
        .order("id", { ascending: true }),
      getWeeklyJourney(supabase, user.id),
      getWeeklyTopicStats(supabase, user.id),
    ]);
    pet = data;
    journeyDays = journeyResult;
    topicStats = topicStatsResult;
    eggChoices = (eggTypeRows ?? []).map((egg) => ({
      id: egg.id,
      nameTh: egg.name_th,
      tier: egg.tier,
      description: egg.description,
      imagePath: getPetImagePath(egg.sprite_prefix, 1, null, null),
    }));
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
      <SignOutLink />
      {pet && needsPersonalityChoice ? (
        <PendingPersonalityCard />
      ) : pet ? (
        <>
        <TrackOnMount event="pet_detail_open" props={{ source: "active" }} petId={pet.id} />
        <PetCard
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
        />
        </>
      ) : (
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          ยังไม่มี Qmon ที่กำลังเลี้ยงอยู่ — ไปที่คลังไข่เพื่อฟักไข่ใบแรก
        </div>
      )}
    </main>
  );
}
