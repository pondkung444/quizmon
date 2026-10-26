import { createClient, getUser } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { getPersonalityKey } from "@/lib/personality";
import { getEvolutionProgress, type Subline, type Personality } from "@/lib/evolution";
import { DAILY_EXP_CAP, getTodayInBangkok } from "@/lib/exp";
import { getDailyExpCap } from "@/lib/dailyExpCap";
import { getGradeBand } from "@/lib/gradeBand";
import QuizClient from "@/components/QuizClient";
import AppThemeMarker from "@/components/AppThemeMarker";
import BgmMuteButton from "@/components/audio/BgmMuteButton";
import { elementFromSpritePrefix, eggCracksBefore, parseStardustPreview, previewSpritePrefix, STARDUST_TEXT } from "@/lib/stardust";
import StardustPreview from "@/components/quiz/stardust/StardustPreview";
import type { StardustPetInfo } from "@/components/quiz/stardust/types";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { mission, stardustPreview: stardustPreviewParam, element: elementParam, prior: priorParam, r: endResultsParam } = await searchParams;
  const initialMissionId = typeof mission === "string" ? mission : null;
  // หน้าตอบคำถาม "ตามหาประกายดาว" — เปิดเมื่อ QUIZ_STARDUST_ENABLED=1 เท่านั้น ค่าอื่น/ไม่ตั้ง = หน้าเดิม
  const stardustEnabled = process.env.QUIZ_STARDUST_ENABLED === "1";
  // ?stardustPreview=egg-intro|egg|image|correct|wrong|end|egg-end (ไม่ใช่ production เท่านั้น): ข้อมูลตัวอย่าง ไม่ยิง action/event
  const stardustPreview =
    stardustEnabled && process.env.VERCEL_ENV !== "production" ? parseStardustPreview(stardustPreviewParam) : null;

  const supabase = await createClient();
  const user = await getUser();
  // เพดานของผู้ใช้ (180 ฟรี / 300 premium) — เริ่มยิงไว้ก่อน ขนานกับ query อื่น (getDailyExpCap ไม่ throw)
  const dailyCapPromise = user ? getDailyExpCap(user.id) : Promise.resolve(DAILY_EXP_CAP);
  const gradeBand = user ? await getGradeBand(user.id) : "junior";

  // ระดับชั้นจริงของ user — ใช้เปิด tab เริ่มต้นในหน้าเลือกบทฝึกฝนให้ตรงชั้นตัวเอง
  let gradeLevel: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("grade_level")
      .eq("id", user.id)
      .maybeSingle();
    gradeLevel = profile?.grade_level ?? null;
  }

  let pet: {
    nickname: string | null;
    stage: number;
    subline: string | null;
    personality: string | null;
    exp: number;
    exp_today: number;
    exp_today_date: string;
    egg_types: { sprite_prefix: string } | { sprite_prefix: string }[] | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("pets")
      .select("nickname, stage, subline, personality, exp, exp_today, exp_today_date, egg_types(sprite_prefix)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    pet = data;
  }

  // ค่าชุดเดียว (stage/subline/personality) ใช้ได้ทั้งเลือกชุดบุคลิกและสร้าง path รูป avatar
  // ไม่ query ซ้ำ — ดู getPersonalityKey (src/lib/personality.ts) และ getPetImagePath (src/lib/petImage.ts)
  const personalityKey = getPersonalityKey(pet?.stage ?? 1, pet?.subline ?? null);

  const eggType = pet ? (Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types) : null;
  let petAvatarPath: string | null = null;
  if (pet && eggType) {
    try {
      petAvatarPath = getPetImagePath(
        eggType.sprite_prefix,
        pet.stage,
        (pet.subline ?? null) as Subline | null,
        (pet.personality ?? null) as Personality | null
      );
    } catch (err) {
      console.error(err);
    }
  }

  // avatar เล็กข้าง SpeechBubble ผูกเอฟเฟกต์ "ใกล้วิวัฒนาการ" เดียวกับ /pet (ดู EvolutionGlow.tsx) —
  // ใช้ util กลางตัวเดียวกัน ไม่คำนวณซ้ำ
  const petEvolutionProgress = pet ? getEvolutionProgress(pet.stage, pet.exp) : 0;
  const petExpTodaySoFar = pet && pet.exp_today_date === getTodayInBangkok() ? pet.exp_today : 0;
  // glow หยุดพัลส์ที่เพดานจริงของผู้ใช้คนนั้น ไม่ใช่ 180 ตายตัว
  const dailyCap = await dailyCapPromise;
  const petDailyCapped = petExpTodaySoFar >= dailyCap;

  const stardust: StardustPetInfo | null =
    stardustEnabled && pet
      ? {
          element: elementFromSpritePrefix(eggType?.sprite_prefix),
          name: pet.nickname?.trim() || STARDUST_TEXT.fallbackName,
          stage: pet.stage,
          exp: pet.exp,
          cracksBefore: pet.stage === 1 ? eggCracksBefore(pet.exp) : 0,
          showEggIntro: pet.stage === 1 && pet.exp === 0,
        }
      : null;

  if (stardustPreview) {
    // &element=fire|wood|water|sky|earth|divine · &prior=0–5 = ภารกิจที่ทำต่อจากรอบก่อน (ข้อก่อนหน้าไม่รู้ผล) · &r=11010 = ผลหน้าจบรอบ
    const prefix = previewSpritePrefix(elementParam);
    const element = elementFromSpritePrefix(prefix);
    const prior = Math.min(5, Math.max(0, Number.parseInt(typeof priorParam === "string" ? priorParam : "0", 10) || 0));
    return (
      <main className="quiz-shell mx-auto flex min-h-screen w-full flex-col gap-6">
        <AppThemeMarker />
        <BgmMuteButton className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] lg:left-[calc(50%-var(--app-frame-w)/2+0.75rem)]" />
        <StardustPreview
          kind={stardustPreview}
          element={element}
          prior={prior}
          endResults={
            typeof endResultsParam === "string" && /^[01]{5}$/.test(endResultsParam)
              ? [...endResultsParam].map((c) => c === "1")
              : null
          }
          petImg={`/pets/${prefix}_stage2_baby.png`}
          eggImg={`/pets/${prefix}_stage1_egg.png`}
        />
      </main>
    );
  }

  return (
    <main className="quiz-shell mx-auto flex min-h-screen w-full flex-col gap-6">
      {/* ธีมแอป (dusk/day) — สีเฉพาะหน้านี้อยู่ที่ --quiz-* / --color-correct ใน globals.css */}
      <AppThemeMarker />
      {/* ปุ่มปิด/เปิดเพลงพื้นหลังแบบด่วน — มุมบนซ้าย (มุมบนขวาเป็นปุ่มออกจากรอบของ QuizClient) */}
      <BgmMuteButton className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] lg:left-[calc(50%-var(--app-frame-w)/2+0.75rem)]" />
      <QuizClient
        personalityKey={personalityKey}
        petAvatarPath={petAvatarPath}
        petEvolutionProgress={petEvolutionProgress}
        petDailyCapped={petDailyCapped}
        initialMissionId={initialMissionId}
        gradeBand={gradeBand}
        gradeLevel={gradeLevel}
        stardust={stardust}
      />
    </main>
  );
}
