"use server";

import { createClient } from "@/lib/supabase/server";
import { getTodayInBangkok } from "@/lib/exp";

const MIN_DISTINCT_PLAY_DAYS = 3;

const MOODS = ["great", "good", "neutral", "bad"] as const;
const FRICTIONS = ["no_start_button", "pet_growth_unclear", "exp_unclear", "none"] as const;
const DIFFICULTIES = ["good", "hard", "too_hard"] as const;
const GRAPHICS_RATINGS = ["love", "good", "neutral", "dislike"] as const;
const GRAPHICS_ISSUES = ["sprites_similar", "theme_dull", "text_hard_read", "effects_plain", "none"] as const;
const WANTS = ["more_subjects", "more_qmon_chat", "see_classmates", "other"] as const;

export type Mood = (typeof MOODS)[number];
export type Friction = (typeof FRICTIONS)[number];
export type ContentDifficulty = (typeof DIFFICULTIES)[number];
export type GraphicsRating = (typeof GRAPHICS_RATINGS)[number];
export type GraphicsIssue = (typeof GRAPHICS_ISSUES)[number];
export type Want = (typeof WANTS)[number];

export type FeedbackInput = {
  mood: Mood;
  friction: Friction[];
  content_difficulty: ContentDifficulty;
  flagged_question_ids: number[];
  graphics_rating: GraphicsRating;
  graphics_issues: GraphicsIssue[];
  wants: Want[];
  free_text: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function isSubsetOf<T extends string>(values: unknown, allowed: readonly T[]): values is T[] {
  return Array.isArray(values) && values.every((v) => (allowed as readonly string[]).includes(v));
}

// pattern เดียวกับ getActivePetId ใน src/app/quiz/actions.ts — ไม่ import ตรงเพราะไฟล์นั้นไม่ export
// ฟังก์ชันนี้ (internal เฉพาะไฟล์) และไม่คุ้มเพิ่ม export แค่ให้ไฟล์นี้ยืม
async function getActivePetId(supabase: SupabaseServerClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("pets").select("id").eq("user_id", userId).eq("is_active", true).maybeSingle();
  return data?.id ?? null;
}

// ใช้ authenticated client ปกติ (ไม่ใช่ createAdminClient) — insert แบบ user เดียวกับ auth.uid() ให้
// RLS "player_feedback: insert own" คุมอยู่ตรงๆ (pattern เดียวกับ qmon_messages) validate ฝั่งนี้ก่อน
// insert เป็น defense in depth ชั้นแรก แม้ DB มี check constraint/varchar(60) คุมอยู่แล้วก็ตาม
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อนส่งความคิดเห็น");

  if (!MOODS.includes(input.mood)) throw new Error("mood ไม่ถูกต้อง");
  if (!isSubsetOf(input.friction, FRICTIONS)) throw new Error("friction ไม่ถูกต้อง");
  if (!DIFFICULTIES.includes(input.content_difficulty)) throw new Error("content_difficulty ไม่ถูกต้อง");
  if (!GRAPHICS_RATINGS.includes(input.graphics_rating)) throw new Error("graphics_rating ไม่ถูกต้อง");
  if (!isSubsetOf(input.graphics_issues, GRAPHICS_ISSUES)) throw new Error("graphics_issues ไม่ถูกต้อง");
  if (!isSubsetOf(input.wants, WANTS)) throw new Error("wants ไม่ถูกต้อง");
  if (input.free_text !== null && input.free_text.length > 60) throw new Error("free_text ยาวเกินไป");
  if (!Array.isArray(input.flagged_question_ids) || !input.flagged_question_ids.every((id) => Number.isInteger(id))) {
    throw new Error("flagged_question_ids ไม่ถูกต้อง");
  }

  const petId = await getActivePetId(supabase, user.id);

  const { error } = await supabase.from("player_feedback").insert({
    user_id: user.id,
    pet_id: petId,
    mood: input.mood,
    friction: input.friction,
    content_difficulty: input.content_difficulty,
    flagged_question_ids: input.flagged_question_ids,
    graphics_rating: input.graphics_rating,
    graphics_issues: input.graphics_issues,
    wants: input.wants,
    free_text: input.free_text,
  });
  if (error) throw new Error(error.message);
}

// นับจำนวนวัน (distinct, อิงปฏิทิน Asia/Bangkok) ที่ user มีแถว quiz_attempts อย่างน้อย 1 แถว —
// แปลงเป็นวันไทยก่อนนับเสมอ (ห้ามนับ UTC date ตรงๆ เพราะแถวช่วงหลังเที่ยงคืน UTC จะเลื่อนวันผิด)
// ใช้ getTodayInBangkok() ตัวเดียวกับที่ weeklyJourney.ts/missions.ts ใช้แปลง timestamp -> วันไทย
// ไม่ limit จำนวนแถว (ตาราง quiz_attempts ทั้งระบบยังหลักพันแถว ต่อ user ยิ่งน้อยกว่ามาก โอเคที่จะดึงเต็ม)
async function getDistinctPlayDaysCount(supabase: SupabaseServerClient, userId: string): Promise<number> {
  const { data } = await supabase.from("quiz_attempts").select("created_at").eq("user_id", userId);
  const days = new Set((data ?? []).map((row) => getTodayInBangkok(new Date(row.created_at as string))));
  return days.size;
}

// เช็คว่าควรเปิด feedback popup อัตโนมัติหลังภารกิจไหม — เรียกจาก QuizClient ตอนปิด popup อาหารแล้ว
// (ไม่ใช่ปุ่มถาวรที่ /pet ซึ่งเปิดได้ไม่จำกัดครั้งโดยไม่เช็คเงื่อนไขนี้ ไม่ผ่านเงื่อนไขนี้เลย)
export async function shouldShowFeedbackPrompt(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // exclude ADMIN_EMAILS เหมือน src/app/admin/analytics/page.tsx — กันบัญชีทดสอบภายใน (Dawu/PonDKunG)
  // โดนถามความเห็นตัวเองระหว่างไล่เช็คระบบ
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const userEmail = user.email?.toLowerCase();
  if (userEmail && adminEmails.includes(userEmail)) return false;

  // ต้องเล่นมาแล้วมากกว่า 3 วัน (>=4 วันที่ต่างกัน) ถึงจะเริ่มถามอัตโนมัติ — เด็กที่เพิ่งมาเล่นวันแรกๆ
  // ยังไม่รู้จักฟีเจอร์พอจะให้ความเห็นที่มีความหมาย
  const [distinctPlayDays, { data: existingFeedback }] = await Promise.all([
    getDistinctPlayDaysCount(supabase, user.id),
    supabase.from("player_feedback").select("id").eq("user_id", user.id).limit(1).maybeSingle(),
  ]);
  if (distinctPlayDays <= MIN_DISTINCT_PLAY_DAYS) return false;

  // เคยตอบไปแล้ว (แถวไหนก็ได้ ไม่จำกัด source) = ไม่ต้องถามอัตโนมัติซ้ำอีก รอบทดสอบนี้ถามครั้งเดียวพอ
  return !existingFeedback;
}

export type WrongQuestionOption = { id: number; questionText: string; category: string };

// ดึง 3 ข้อล่าสุดที่ผู้ใช้ตอบผิด (unique question_id) ให้เลือกเป็น flagged_question_ids ตอน
// content_difficulty = too_hard — join quiz_attempts (RLS select own) กับ questions (RLS read
// เฉพาะ authenticated) ผ่าน client ปกติ ไม่ต้องใช้ admin
export async function getRecentWrongQuestions(): Promise<WrongQuestionOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // ดึงมากกว่า 3 แถวเผื่อคำถามเดิมถูกตอบผิดซ้ำหลายครั้ง (ไม่งั้น dedupe เหลือน้อยกว่า 3 ข้อทั้งที่
  // จริงๆ มีให้เลือกพอ) จำกัด 20 พอสำหรับ dedupe เอา 3 ข้อแรกที่ไม่ซ้ำกัน
  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("question_id")
    .eq("user_id", user.id)
    .eq("is_correct", false)
    .order("created_at", { ascending: false })
    .limit(20);

  const uniqueIds = [...new Set((attempts ?? []).map((a) => a.question_id as number))].slice(0, 3);
  if (uniqueIds.length === 0) return [];

  const { data: questions } = await supabase.from("questions").select("id, question_text, category").in("id", uniqueIds);

  const byId = new Map((questions ?? []).map((q) => [q.id as number, q]));
  return uniqueIds
    .map((id) => byId.get(id))
    .filter((q): q is { id: number; question_text: string; category: string } => !!q)
    .map((q) => ({ id: q.id, questionText: q.question_text, category: q.category }));
}
