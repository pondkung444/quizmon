"use server";

import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/gemini";
import {
  assembleDigest,
  buildDigestPrompt,
  validateDigestBody,
  type DigestRow,
} from "@/lib/guardian/digest";

// เพดาน 60 วิ (Vercel Hobby) — เจน 1 ครั้ง ≤ 25 วิ · retry ต่อเมื่อยังเหลืองบพอสำหรับอีกครั้ง
const TOTAL_BUDGET_MS = 55_000;
const CALL_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const NO_ACCESS = "ไม่มีสิทธิ์ใช้ฟีเจอร์นี้";
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

// ห้าม log prompt/ข้อความที่เจน (มีข้อมูลเด็ก) — log เฉพาะ error message
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}

export async function generateDigest(
  studentId: string,
  weekStart: string,
  context: string
): Promise<{ body: string | null; warnings: string[]; error: string | null }> {
  try {
    if (!WEEK_RE.test(weekStart)) return { body: null, warnings: [], error: "สัปดาห์ไม่ถูกต้อง" };
    const supabase = await createClient();

    // ไม่เชื่อ stats จาก client — ดึงเองซ้ำจาก RPC
    const { data, error } = await supabase.rpc("guardian_admin_weekly_digest", { p_week_start: weekStart });
    if (error) {
      return { body: null, warnings: [], error: error.message.includes(NO_ACCESS) ? NO_ACCESS : "โหลดข้อมูลไม่สำเร็จ" };
    }
    const row = ((data ?? []) as DigestRow[]).find((r) => r.student_id === studentId);
    if (!row) return { body: null, warnings: [], error: "ไม่พบเด็กคนนี้ในสัปดาห์ที่เลือก" };

    // prompt ได้แค่ stats (ไม่มี username/student_id) + context ของครู
    const prompt = buildDigestPrompt({ stats: row.stats, context: context.slice(0, 500) });

    const started = Date.now();
    let text: string | null = null;
    let warnings: string[] = [];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0 && Date.now() - started > TOTAL_BUDGET_MS - CALL_TIMEOUT_MS) break;
      try {
        const candidate = await callGemini(prompt, {
          timeoutMs: CALL_TIMEOUT_MS,
          maxOutputTokens: 2000,
          temperature: 0.7,
        });
        text = candidate;
        warnings = validateDigestBody(candidate).warnings;
        if (warnings.length === 0) break;
      } catch (e) {
        console.error("[teacher/guardian] gemini failed:", errMsg(e));
        if (text) break; // มีข้อความที่มี warning อยู่แล้ว ใช้อันนั้น
      }
    }
    if (!text) return { body: null, warnings: [], error: 'เจนข้อความไม่สำเร็จ กด "เจนใหม่" อีกครั้ง' };

    const full = assembleDigest({ username: row.username, body: text });
    const { error: saveError } = await supabase.rpc("guardian_admin_save_digest", {
      p_student_id: studentId,
      p_week_start: weekStart,
      p_body: full,
      p_context: context.slice(0, 500),
      p_edited: false,
    });
    if (saveError) {
      console.error("[teacher/guardian] save failed:", saveError.message);
      return { body: full, warnings, error: "เจนแล้วแต่บันทึกไม่สำเร็จ" };
    }
    return { body: full, warnings, error: null };
  } catch (e) {
    console.error("[teacher/guardian] generateDigest failed:", errMsg(e));
    return { body: null, warnings: [], error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };
  }
}

export async function saveDigestEdit(
  studentId: string,
  weekStart: string,
  body: string,
  context: string
): Promise<{ error: string | null }> {
  try {
    if (!WEEK_RE.test(weekStart)) return { error: "สัปดาห์ไม่ถูกต้อง" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("guardian_admin_save_digest", {
      p_student_id: studentId,
      p_week_start: weekStart,
      p_body: body,
      p_context: context.slice(0, 500),
      p_edited: true,
    });
    if (error) return { error: "บันทึกไม่สำเร็จ" };
    return { error: null };
  } catch (e) {
    console.error("[teacher/guardian] saveDigestEdit failed:", errMsg(e));
    return { error: "บันทึกไม่สำเร็จ" };
  }
}
