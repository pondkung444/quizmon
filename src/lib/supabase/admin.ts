import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ใช้ service role key อ่านตาราง questions (มี correct_index/explanation ที่ห้ามส่งให้ client
// เห็นก่อนตอบ) เพราะตารางนี้ล็อก RLS ไว้ไม่มี select policy ให้ anon/authenticated
// ห้าม import ไฟล์นี้จากไฟล์ที่มี "use client" เด็ดขาด
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
