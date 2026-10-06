import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ใช้ service role key อ่านตาราง questions (รวม correct_index/explanation) เพราะ authenticated
// อ่านสองคอลัมน์นี้ตรงไม่ได้ (column-level grant, 20261006151948) — startQuizRound ตั้งใจ
// ส่งเฉลย+คำอธิบายต่อให้ client เก็บไว้เช็คเองแบบทันที (ดู QuizRoundQuestion) แต่ submitAnswer
// ก็ยังคง re-check ถูก/ผิดจาก DB นี้เองเสมอเวลาคำนวณ EXP ไม่รับ flag ถูก/ผิดจาก client
// ห้าม import ไฟล์นี้จากไฟล์ที่มี "use client" เด็ดขาด
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
