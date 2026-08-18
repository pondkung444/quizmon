import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, grade_level")
          .eq("id", user.id)
          .single();

        if (!profile?.username || !profile?.grade_level) {
          return NextResponse.redirect(`${origin}/login/complete-profile`);
        }
        return NextResponse.redirect(`${origin}/pet`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
