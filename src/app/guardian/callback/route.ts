import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// mirror ของ /login/callback แต่แยก route ต่างหาก — ไม่ตรวจ profiles (นักเรียนเท่านั้น) และปล่อยให้
// หน้า /guardian เป็นคนตัดสิน allowlist / guardians row ต่อเอง (getGuardianAccess)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/guardian`);
    }
  }

  return NextResponse.redirect(`${origin}/guardian?error=oauth_failed`);
}
