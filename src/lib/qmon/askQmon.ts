"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getTodayInBangkok } from "@/lib/exp";
import { getEvolutionProgress } from "@/lib/evolution";
import {
  buildEncouragePrompt,
  buildPracticePrompt,
  buildProgressPrompt,
  buildChatPrompt,
  getFallbackQmonMessage,
  resolvePersonaTone,
  type PersonaPetInput,
  type ProgressInputSummary,
} from "./personaPrompt";

// เดิมใช้ "gemini-1.5-flash" ตรงๆ — เจอตอนทดสอบจริงว่า Google เลิกรองรับโมเดลนี้ไปแล้ว (404
// ทุกครั้ง แปลว่าตลอดมา flow นี้ fallback ไป template เงียบๆ ไม่เคยเรียก Gemini สำเร็จจริงเลย)
// เปลี่ยนมาใช้ alias "-latest" แทนการ pin ชื่อรุ่นตรงๆ เพื่อกันบั๊กคลาสเดียวกันเกิดซ้ำอนาคต (ตอนนี้
// resolve ไปที่ gemini-3.6-flash) — คีย์นี้เจอด้วยว่า gemini-2.5-flash/2.5-flash-lite ไม่รองรับ
// ผู้ใช้ใหม่แล้ว และ gemini-2.0-* ทุกตัวติด quota (429) กับคีย์นี้โดยเฉพาะ มีแค่ "-latest" ที่ใช้ได้จริง
const GEMINI_MODEL = "gemini-flash-latest";
// deploy ปัจจุบัน (2026-07) ยังเป็น Vercel serverless function — 8s เผื่อ margin ไว้ก่อนชน
// function timeout ของแผนที่ใช้อยู่ ถ้าย้ายไป Railway (ไม่มีข้อจำกัดนี้) ค่อยยืดได้
const GEMINI_TIMEOUT_MS = 8_000;

// จำนวน quiz_attempts ล่าสุดที่ใช้คำนวณ accuracy ของเมนู "ขอแรงใจ" เท่านั้น (ทำงานดีอยู่แล้ว
// ไม่แตะ) — practice ใช้ RECENT_ATTEMPTS_LIMIT_PRACTICE แยกต่างหาก (ดูด้านล่าง เหตุผลต่างกัน)
const RECENT_ATTEMPTS_LIMIT = 20;

// จำนวน analytics_events ล่าสุดที่ใช้คำนวณ weakest category ของเมนู "ควรฝึกอะไร" — แยกจาก
// RECENT_ATTEMPTS_LIMIT ของ encourage เพราะ practice กระจายสัญญาณไปตามหมวดหมู่ย่อยถึง ~26 หมวด
// ต้องการ sample ใหญ่กว่าถึงจะมีสัญญาณต่อหมวดพอเชื่อถือได้ (ไม่ใช่ n=1 flukes)
//
// validate กับข้อมูลจริง (project monschool, 44 users ที่มี question_answer events) เทียบ 3 ค่า:
//   window=20:  35/44 users ได้ pick เฉพาะหมวด, median สัญญาณหนุนหลัง = 1 ครั้ง (บางๆ มาก)
//   window=50:  38/44 users ได้ pick, median สัญญาณ = 2 ครั้ง (ดีขึ้นชัดเจน)
//   window=100: 39/44 users ได้ pick, median สัญญาณ = 2 ครั้งเท่าเดิม (แทบไม่ต่างจาก 50 แต่ query
//               หนักกว่าเกือบเท่าตัว)
// เลือก 50 เพราะเป็นจุดที่ signal quality ดีขึ้นชัดจาก 20 แต่ยังไม่เจอ diminishing returns เหมือน 100
const RECENT_ATTEMPTS_LIMIT_PRACTICE = 50;

export interface AskQmonResult {
  message: string;
  source: "gemini" | "fallback_template" | "cache";
}

type QmonMenu = "encourage" | "practice" | "progress" | "chat";

interface ActivePet {
  id: string;
  stage: number;
  subline: string | null;
  personality: "A" | "B" | null;
  // ใช้เฉพาะเมนู "ดูพัฒนาการ" (signal 1: evolution progress) — เมนูอื่นไม่แตะคอลัมน์นี้
  exp: number;
}

// ทุกเมนูเริ่มจากขั้นตอนเดียวกันเป๊ะ: ต้อง login + มี pet active อยู่ — รวมเป็น helper กลาง
// กันก็อปโค้ดระหว่าง askQmonEncourage/askQmonPractice (และเมนูถัดไปในอนาคต)
async function requireActivePet(
  supabase: SupabaseClient
): Promise<{ userId: string; pet: ActivePet }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, stage, subline, personality, exp")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (petError || !pet) throw new Error("ไม่พบ Qmon ที่กำลังเลี้ยงอยู่");

  return { userId: user.id, pet };
}

// pets.personality ล็อกจาก majority vote ตอน stage 4 เท่านั้น — ก่อนหน้านั้น "ยังไม่นิ่ง" ห้ามส่ง
// ค่าจริงเข้า persona resolution แม้แถวจะมีค่าเก่าเหลืออยู่ก็ตาม (บั๊กที่พลาดง่ายที่สุดของงานนี้)
function toPersonaPet(pet: ActivePet): PersonaPetInput {
  return {
    stage: pet.stage,
    subline: pet.subline,
    personality: pet.stage >= 4 ? pet.personality : null,
  };
}

// ข้อ 1 ของทุก flow เสมอ: เช็ค cache ก่อน ไม่มีแล้วค่อยไปต่อ (ไม่แตะ Gemini/สถิติเลยถ้าเจอ cache)
async function getCachedQmonMessage(
  supabase: SupabaseClient,
  petId: string,
  menu: QmonMenu,
  cacheDate: string
): Promise<string | null> {
  const { data: cached } = await supabase
    .from("qmon_menu_cache")
    .select("ai_response")
    .eq("pet_id", petId)
    .eq("menu", menu)
    .eq("cache_date", cacheDate)
    .maybeSingle();

  return cached?.ai_response ?? null;
}

// เรียก Gemini แล้ว fallback อัตโนมัติถ้า error/timeout — ใช้ร่วมกันทุกเมนู ต่างกันแค่ prompt/fallback
// ที่ส่งเข้ามา (menu-specific logic อยู่ฝั่งผู้เรียกทั้งหมด ฟังก์ชันนี้ไม่รู้จักเมนูไหนเลย)
async function generateQmonMessage(
  prompt: string,
  buildFallback: () => string
): Promise<{ message: string; source: "gemini" | "fallback_template" }> {
  try {
    return { message: await callGemini(prompt), source: "gemini" };
  } catch {
    return { message: buildFallback(), source: "fallback_template" };
  }
}

// ข้อ 5/6 ของทุก flow: log ทุกครั้งไม่ว่า source ไหน (audit trail ห้ามพลาด) + upsert cache เฉพาะ
// ตอนสำเร็จจริงจาก Gemini เท่านั้น (ห้าม cache fallback กันติด fallback ทั้งวัน) — best-effort ทั้งคู่
// ไม่ throw ทับข้อความที่ generate มาได้แล้ว
async function logAndCacheQmonMessage(
  supabase: SupabaseClient,
  params: {
    petId: string;
    menu: QmonMenu;
    inputSummary: Record<string, unknown>;
    message: string;
    source: "gemini" | "fallback_template";
    cacheDate: string;
  }
): Promise<void> {
  const { petId, menu, inputSummary, message, source, cacheDate } = params;

  const { error: logError } = await supabase.from("qmon_messages").insert({
    pet_id: petId,
    menu,
    input_summary: inputSummary,
    ai_response: message,
    source,
  });
  if (logError) console.error("qmon_messages insert failed:", logError.message);

  if (source === "gemini") {
    const { error: cacheError } = await supabase.rpc("upsert_qmon_cache", {
      p_pet_id: petId,
      p_menu: menu,
      p_cache_date: cacheDate,
      p_ai_response: message,
      p_source: source,
    });
    if (cacheError) console.error("upsert_qmon_cache failed:", cacheError.message);
  }
}

// เมนู "ขอแรงใจ"
//
// ลำดับ flow ตั้งใจตรึงไว้แบบนี้ ห้ามสลับ:
// 1) เช็ค qmon_menu_cache ก่อนเสมอ — มีแล้ว return ทันที ไม่แตะ quiz_attempts/Gemini เลย
// 2) ไม่มี cache -> คำนวณสถิติจาก quiz_attempts ฝั่งเซิร์ฟเวอร์
// 3) persona resolution จากสถิติ + pet
// 4) เรียก Gemini (timeout 8s)
// 5) สำเร็จ -> log + upsert cache (source: gemini)
// 6) ล้มเหลว -> log อย่างเดียว (source: fallback_template) ห้าม upsert cache กันไว้ให้ request
//    ถัดไปยังมีโอกาสได้ของจริงจาก Gemini แทนที่จะติด fallback ทั้งวัน
export async function askQmonEncourage(): Promise<AskQmonResult> {
  const supabase = await createClient();
  const { userId, pet } = await requireActivePet(supabase);
  const today = getTodayInBangkok();

  const cached = await getCachedQmonMessage(supabase, pet.id, "encourage", today);
  if (cached) return { message: cached, source: "cache" };

  // คำนวณสถิติจาก quiz_attempts (ตัวเลขล้วนๆ ห้ามมี PII — ดู comment บน qmon_messages.input_summary)
  const { data: recentAttempts } = await supabase
    .from("quiz_attempts")
    .select("is_correct")
    .eq("pet_id", pet.id)
    .order("created_at", { ascending: false })
    .limit(RECENT_ATTEMPTS_LIMIT);

  const attemptsCounted = recentAttempts?.length ?? 0;
  const correctCounted = recentAttempts?.filter((a) => a.is_correct).length ?? 0;
  const accuracyPct = attemptsCounted > 0 ? Math.round((correctCounted / attemptsCounted) * 100) : null;

  const { data: lastMission } = await supabase
    .from("daily_missions")
    .select("mission_date")
    .eq("user_id", userId)
    .not("bonus_awarded_at", "is", null)
    .order("mission_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const daysSinceLastMission = lastMission
    ? Math.round(
        (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${lastMission.mission_date}T00:00:00Z`).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : null;

  const inputSummary = { accuracyPct, daysSinceLastMission };
  const personaPet = toPersonaPet(pet);

  const { message, source } = await generateQmonMessage(
    buildEncouragePrompt(personaPet, inputSummary),
    () => getFallbackQmonMessage(personaPet)
  );

  await logAndCacheQmonMessage(supabase, {
    petId: pet.id,
    menu: "encourage",
    inputSummary,
    message,
    source,
    cacheDate: today,
  });

  return { message, source };
}

// ตอบผิด+ช้า = ไม่เข้าใจจริง — validated กับข้อมูล production จริง (project monschool):
// ข้อที่ตอบผิดมี p75 ~15.6s, p90 ~28.8s (avg รวม 33.6s แต่เบ้ขวาจาก outlier) 15s จึงจับกลุ่ม
// ควอไทล์ช้าสุดของ "ผิด" ได้พอดี ไม่สุดโต่งเกินจนเหลือแต่ outlier หายาก
const SLOW_THRESHOLD_MS = 15_000;

// ตอบผิด+เร็ว = มั่ว — validated เช่นกัน: ข้อที่ตอบผิดและ <2s มี 144/1133 แถว (12.7%) ใกล้เคียงกับ
// เลข 14% ที่อ้างอิงมาจากข้อมูลเดิม ถือว่า 2s เป็นจุดตัดที่สมเหตุสมผลแล้ว ไม่ต้องปรับ
const FAST_GUESS_THRESHOLD_MS = 2_000;

// DAU ต่ำ + หมวดหมู่ย่อยเยอะ (26 บท) ทำให้ข้อมูลต่อรอบอาจน้อยเกินสรุปทางสถิติ — ต่ำกว่านี้ไม่ฟันธง
// หมวดใดหมวดหนึ่ง ให้ fallback เป็นคำแนะนำทั่วไปแทน
const MIN_ATTEMPTS_FOR_RECOMMENDATION = 5;

// น้ำหนักตอนเลือก "หมวดที่ควรฝึกต่อ" — ให้ "ไม่เข้าใจ" (confused) มีน้ำหนักมากกว่า "มั่ว" (careless)
// เพราะ confused คือปัญหาความเข้าใจจริง ส่วน careless อาจแค่ไม่ตั้งใจ (ดู spec ข้อ 4)
const CONFUSED_WEIGHT = 1;
const CARELESS_WEIGHT = 0.5;

type PracticePattern = "confused" | "careless" | "insufficient_data";

interface PracticeAttempt {
  category: string;
  isCorrect: boolean;
  timeUsedMs: number | null;
}

// เมนู "ควรฝึกอะไร" — logic เฉพาะเมนูนี้ (คำนวณ weakest category จาก analytics_events) อยู่ในนี้
// ทั้งหมด ส่วนที่ซ้ำกับ encourage (auth+pet, cache check, เรียก Gemini+fallback, log/cache)
// ใช้ helper กลางด้านบนร่วมกัน
//
// **สำคัญ**: quiz_attempts ไม่มีคอลัมน์เวลาต่อข้อ — เวลาอยู่ใน analytics_events.props.time_used_ms
// เท่านั้น (event_name='question_answer') ตารางนี้เดิมมีแค่ insert policy ไม่มี select policy
// ให้ authenticated เลย (ยืนยันจาก pg_policies จริง) — เพิ่ม select policy "Users can view their
// own analytics events" ให้แล้วใน migration 20260724092924_analytics_events_select_own.sql
// (ตัดสินใจใช้ RLS จริงแทนการอ่านผ่าน admin client เหมือนตอนแรก เพราะไม่อยากให้ความปลอดภัยไปฝาก
// ไว้ที่การจำ .eq("user_id", ...) ในทุกจุดที่โค้ดในอนาคตจะมาอ่านตารางนี้เพียงอย่างเดียว) ใช้
// createClient() ตัวเดียวกับเมนูอื่นทั้งหมด — .eq("user_id", userId) ด้านล่างยังคงไว้เป็น
// defense-in-depth ไม่เสียหาย แต่ RLS เป็นชั้นป้องกันหลักแล้วตอนนี้
//
// analytics_events เป็น buffer-then-write ไม่ transactional เหมือน quiz_attempts อาจมี event
// ตกหล่นได้ — query นี้อ่านจาก analytics_events อย่างเดียว ไม่ join กับ quiz_attempts เลย
// (กันปัญหาจำนวนไม่ตรงกัน)
export async function askQmonPractice(): Promise<AskQmonResult> {
  const supabase = await createClient();
  const { userId, pet } = await requireActivePet(supabase);
  const today = getTodayInBangkok();

  const cached = await getCachedQmonMessage(supabase, pet.id, "practice", today);
  if (cached) return { message: cached, source: "cache" };

  const { data: events } = await supabase
    .from("analytics_events")
    .select("props")
    .eq("user_id", userId)
    .eq("event_name", "question_answer")
    .order("created_at", { ascending: false })
    .limit(RECENT_ATTEMPTS_LIMIT_PRACTICE);

  // props เป็น jsonb ไม่บังคับ schema — event เก่า/พลาดบางฟิลด์ได้ ระวัง null/missing key ทุกตัว
  // ไม่ error ทั้ง query แค่ตัด attempt นั้นออกถ้าขาดฟิลด์ที่จำเป็นจริงๆ (category, is_correct)
  const attempts: PracticeAttempt[] = (events ?? []).flatMap((row) => {
    const props = row.props as Record<string, unknown> | null;
    if (!props || typeof props.category !== "string" || typeof props.is_correct !== "boolean") {
      return [];
    }
    return [
      {
        category: props.category,
        isCorrect: props.is_correct,
        // time_used_ms หายไปในบาง event เก่าได้ — treat เป็น "ไม่ทราบเวลา" (null) ไม่ใช่ error
        timeUsedMs: typeof props.time_used_ms === "number" ? props.time_used_ms : null,
      },
    ];
  });

  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter((a) => a.isCorrect).length;
  const overallAccuracyPct = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : null;

  let weakestCategory: string | null = null;
  let weakestCategoryPattern: PracticePattern = "insufficient_data";

  if (totalAttempts >= MIN_ATTEMPTS_FOR_RECOMMENDATION) {
    const byCategory = new Map<string, { confused: number; careless: number }>();

    for (const a of attempts) {
      if (a.isCorrect) continue; // เฉพาะข้อที่ตอบผิดเท่านั้นที่เข้าเกณฑ์ confused/careless
      if (a.timeUsedMs === null) continue; // ไม่ทราบเวลา ข้ามไปเงียบๆ ไม่นับทั้ง confused/careless
      const bucket = byCategory.get(a.category) ?? { confused: 0, careless: 0 };
      if (a.timeUsedMs > SLOW_THRESHOLD_MS) bucket.confused += 1;
      else if (a.timeUsedMs < FAST_GUESS_THRESHOLD_MS) bucket.careless += 1;
      byCategory.set(a.category, bucket);
    }

    let bestScore = 0;
    for (const [category, { confused, careless }] of byCategory) {
      const score = confused * CONFUSED_WEIGHT + careless * CARELESS_WEIGHT;
      if (score > bestScore) {
        bestScore = score;
        weakestCategory = category;
        weakestCategoryPattern = confused >= careless ? "confused" : "careless";
      }
    }
    // มี attempts พอ (>= MIN_ATTEMPTS_FOR_RECOMMENDATION) แต่ไม่มีสัญญาณ confused/careless เลย
    // (เช่นตอบถูกเกือบหมด) — ยังถือเป็น insufficient_data ในแง่ "ไม่มีหมวดให้ฟันธง" เหมือนกัน
    if (!weakestCategory) weakestCategoryPattern = "insufficient_data";
  }

  const inputSummary = { weakestCategory, weakestCategoryPattern, overallAccuracyPct };
  const personaPet = toPersonaPet(pet);

  const { message, source } = await generateQmonMessage(
    buildPracticePrompt(personaPet, inputSummary),
    () => getFallbackQmonMessage(personaPet)
  );

  await logAndCacheQmonMessage(supabase, {
    petId: pet.id,
    menu: "practice",
    inputSummary,
    message,
    source,
    cacheDate: today,
  });

  return { message, source };
}

// เมนู "ดูพัฒนาการ" (progress) — คำนวณ 3 สัญญาณอิสระต่อกัน (evolution/trend/consistency) แล้วเลือก
// "สัญญาณเด่นสุด" แค่ 1 ตัวส่งให้ Gemini เอง (ห้ามส่งทั้ง 3 ให้ Gemini เลือก กันคุมทิศทางคำตอบไม่ได้
// และกัน input_summary ใหญ่เกินจำเป็น) ทุก threshold ด้านล่าง validate กับข้อมูลจริงแล้ว (project
// monschool) ก่อนฟันธง ไม่ได้เดา — ดูตัวเลขกำกับแต่ละ threshold

// Signal 1 (evolution): reuse สูตรเดียวกับ progress bar หน้า /pet เป๊ะๆ (getEvolutionProgress ใน
// lib/evolution.ts) ไม่คิดสูตรใหม่ — validate: สัตว์เลี้ยงที่ยัง stage < 4 ทั้งหมด 58 ตัว มี 4 ตัว
// (6.9%) ที่ >= 80% พอดี ถือว่า "เด่น" ในความถี่ที่สมเหตุสมผล (ไม่ใช่ทุกคนเห็นบ่อยจนเฟ้อ)
const EVOLUTION_NOTABLE_THRESHOLD = 0.8;

// Signal 2 (trend): เทียบ accuracy ของ N ข้อล่าสุด vs N ข้อก่อนหน้า ใช้ N เดียวกับ
// RECENT_ATTEMPTS_LIMIT ของ encourage (=20) เพื่อความสม่ำเสมอ — validate แล้วว่าไม่ต้องแยกค่า:
// 44/73 ตัว (60%) มีข้อมูลพอ (>= MIN_ATTEMPTS_PER_TREND_WINDOW ทั้ง 2 ช่วง) ที่ window นี้ ในจำนวนนั้น
// 8 ตัว (18%) ผ่านเกณฑ์ 15pp ถือว่าความถี่เด่นสมเหตุสมผลเช่นกัน
const TREND_WINDOW = RECENT_ATTEMPTS_LIMIT;
// ต่ำกว่านี้ต่อช่วงถือว่า sample เล็กเกินไปจะเชื่อถือไม่ได้ (fluke) — ข้ามสัญญาณนี้ไปเงียบๆ แทนการฟันธง
const MIN_ATTEMPTS_PER_TREND_WINDOW = 10;
const ACCURACY_TREND_NOTABLE_PP = 15;

// Signal 3 (consistency): นับจำนวนวัน (อิงเวลาไทย) ที่มี attempt อย่างน้อย 1 ครั้งใน 7 วันล่าสุด
// validate แล้ว: ในข้อมูลจริงไม่มีสัตว์เลี้ยงตัวไหนถึง 6-7 วันเลย มากสุดคือ 5 วัน (4 ตัวเข้าเกณฑ์นี้
// พอดี) เลือก 5 เพราะเป็นจุดสูงสุดที่สังเกตได้จริง ถ้าตั้งสูงกว่านี้จะไม่มีใครเข้าเกณฑ์เลย
const CONSISTENCY_WINDOW_DAYS = 7;
const CONSISTENCY_NOTABLE_DAYS = 5;

// ลำดับความสำคัญตอนมีมากกว่า 1 สัญญาณ "เด่น" พร้อมกัน — evolution มาก่อนเพราะเห็นภาพชัดสุดในเกม
// อยู่แล้ว (มี progress bar ให้เห็นตรงๆ) ตามด้วย consistency (พฤติกรรมสม่ำเสมอ) ท้ายสุด trend
// (ตัวเลขนามธรรมสุดในสามตัว เข้าใจยากกว่าอีก 2 อย่าง)
export async function askQmonProgress(): Promise<AskQmonResult> {
  const supabase = await createClient();
  const { pet } = await requireActivePet(supabase);
  const today = getTodayInBangkok();

  const cached = await getCachedQmonMessage(supabase, pet.id, "progress", today);
  if (cached) return { message: cached, source: "cache" };

  // Signal 1: evolution — stage >= 4 คืน 0 เสมอจากฟังก์ชันนี้อยู่แล้ว (ไม่มี threshold ถัดไปให้เทียบ)
  // จึงไม่มีทาง "เด่น" โดยอัตโนมัติ ไม่ต้องเช็ค stage แยกซ้ำ
  const evolutionProgress = getEvolutionProgress(pet.stage, pet.exp);
  const evolutionNotable = evolutionProgress >= EVOLUTION_NOTABLE_THRESHOLD;

  // Signal 2: trend — ดึง 2 ช่วงรวด (2*TREND_WINDOW แถว) แล้วตัดแบ่งฝั่ง JS แทนการ query 2 รอบ
  const { data: trendAttempts } = await supabase
    .from("quiz_attempts")
    .select("is_correct")
    .eq("pet_id", pet.id)
    .order("created_at", { ascending: false })
    .limit(TREND_WINDOW * 2);

  const recentWindow = (trendAttempts ?? []).slice(0, TREND_WINDOW);
  const prevWindow = (trendAttempts ?? []).slice(TREND_WINDOW, TREND_WINDOW * 2);

  let accuracyDeltaPct: number | null = null;
  if (recentWindow.length >= MIN_ATTEMPTS_PER_TREND_WINDOW && prevWindow.length >= MIN_ATTEMPTS_PER_TREND_WINDOW) {
    const recentAcc = recentWindow.filter((a) => a.is_correct).length / recentWindow.length;
    const prevAcc = prevWindow.filter((a) => a.is_correct).length / prevWindow.length;
    accuracyDeltaPct = Math.round((recentAcc - prevAcc) * 100);
  }
  const trendNotable = accuracyDeltaPct !== null && accuracyDeltaPct >= ACCURACY_TREND_NOTABLE_PP;

  // Signal 3: consistency — นับ distinct วัน (Bangkok tz) จาก created_at ใน 7 วันล่าสุด
  const sinceIso = new Date(Date.now() - CONSISTENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: consistencyAttempts } = await supabase
    .from("quiz_attempts")
    .select("created_at")
    .eq("pet_id", pet.id)
    .gte("created_at", sinceIso);

  const activeDaysLast7 = new Set(
    (consistencyAttempts ?? []).map((a) => getTodayInBangkok(new Date(a.created_at)))
  ).size;
  const consistencyNotable = activeDaysLast7 >= CONSISTENCY_NOTABLE_DAYS;

  let inputSummary: ProgressInputSummary;
  if (evolutionNotable) {
    inputSummary = { primarySignal: "evolution", pctToNextStage: Math.round(evolutionProgress * 100) };
  } else if (consistencyNotable) {
    inputSummary = { primarySignal: "consistency", activeDaysLast7 };
  } else if (trendNotable) {
    inputSummary = { primarySignal: "trend", accuracyDeltaPct: accuracyDeltaPct as number };
  } else {
    inputSummary = { primarySignal: "none" };
  }

  const personaPet = toPersonaPet(pet);

  const { message, source } = await generateQmonMessage(
    buildProgressPrompt(personaPet, inputSummary),
    () => getFallbackQmonMessage(personaPet, inputSummary.primarySignal === "evolution" ? "nearEvolution" : "random")
  );

  await logAndCacheQmonMessage(supabase, {
    petId: pet.id,
    menu: "progress",
    inputSummary,
    message,
    source,
    cacheDate: today,
  });

  return { message, source };
}

// เมนู "คุยเล่นสั้นๆ" (chat) — เมนูเดียวใน 4 เมนูที่ไม่อิงสถิติใดๆ เลย ห้าม query
// quiz_attempts/analytics_events ในฟังก์ชันนี้เด็ดขาด (ตัดสินใจตอนวางแผนแล้วว่านี่คือเมนูที่เนื้อหา
// ควบคุมยากสุด ไม่ส่งข้อมูลพฤติกรรมใดๆ เข้า Gemini เลยลดความเสี่ยงหลุด PII ให้ต่ำสุดเท่าที่ทำได้)
// input_summary จึงมีแค่ personalityTone ตัวเดียว มาจาก resolvePersonaTone() ล้วนๆ
export async function askQmonChat(): Promise<AskQmonResult> {
  const supabase = await createClient();
  const { pet } = await requireActivePet(supabase);
  const today = getTodayInBangkok();

  const cached = await getCachedQmonMessage(supabase, pet.id, "chat", today);
  if (cached) return { message: cached, source: "cache" };

  const personaPet = toPersonaPet(pet);
  const inputSummary = { personalityTone: resolvePersonaTone(personaPet) };

  const { message, source } = await generateQmonMessage(
    buildChatPrompt(personaPet),
    // fallback ใช้ pool 'tapQmon' แทน 'random' เดิม — 'tapQmon' คือปฏิกิริยาตอนผู้เล่นแตะ/ทัก Qmon
    // เฉยๆ (เช่น "หุหุ จั๊กจี้นะ!", "เล่นกันเหรอ?") ตรงกับบริบท "คุยเล่นทั่วไป" ของเมนูนี้มากกว่า
    // 'idle' ซึ่งสื่อถึง "ผู้เล่นหายไปนาน" (เช่น "เฮ้ๆ ยังอยู่ไหม?") คนละบริบทกัน
    () => getFallbackQmonMessage(personaPet, "tapQmon")
  );

  await logAndCacheQmonMessage(supabase, {
    petId: pet.id,
    menu: "chat",
    inputSummary,
    message,
    source,
    cacheDate: today,
  });

  return { message, source };
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ไม่ได้ตั้งค่า");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // 1000 ไม่ใช่งบสำหรับข้อความที่โชว์จริง (สั้นแค่ 1-2 ประโยค) — gemini-flash-latest
          // เป็นโมเดลที่ "คิด" ก่อนตอบเสมอ (thoughtsTokenCount กินงบ maxOutputTokens ไปด้วย)
          // ทดสอบจริงพบว่ากิน ~450-650 tokens ไปกับการคิดก่อนจะเริ่มพิมพ์คำตอบ ถ้าตั้งงบต่ำ (เช่น
          // 200 เดิม) จะโดนตัดกลางคันตอนกำลังคิดพอดี (finishReason=MAX_TOKENS, content ว่างเปล่า
          // ไม่มีข้อความเลย) ตั้ง 1000 ให้เหลือพอหลังคิดเสร็จ ยืนยันจากการยิงจริง 3 รอบ finishReason
          // ออกมาเป็น STOP (จบตามธรรมชาติ) ทุกครั้ง ไม่ใช่ MAX_TOKENS
          generationConfig: { maxOutputTokens: 1000, temperature: 0.9 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Gemini ไม่ตอบข้อความกลับมา");
    }

    return text.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}
