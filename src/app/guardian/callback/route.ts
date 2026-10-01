import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// mirror ของ /login/callback แต่แยก route ต่างหาก — ไม่ตรวจ profiles (นักเรียนเท่านั้น) และปล่อยให้
// หน้า /guardian เป็นคนตัดสิน allowlist / guardians row ต่อเอง (getGuardianAccess)
// ใช้ทั้งกลับจาก Google และลิงก์ยืนยันอีเมลตอนสมัคร — หลัง exchange สำเร็จเปิดแถว guardians ให้
// (Google ตั้ง account_type ผ่าน metadata ไม่ได้ จึงไม่มี trigger สร้างให้) ล้มเหลวไม่บล็อกการล็อกอิน
// หน้า /guardian มีปุ่มเปิดบัญชีเองเป็น fallback
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { error: ensureError } = await supabase.rpc("guardian_ensure_account");
      if (ensureError) console.error("guardian callback: guardian_ensure_account failed", ensureError.message);
      return NextResponse.redirect(`${origin}/guardian`);
    }
  }

  return NextResponse.redirect(`${origin}/guardian?error=oauth_failed`);
}
