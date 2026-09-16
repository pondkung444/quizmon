import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { FRIEND_INVITE_COOKIE, invitationDestination } from "@/lib/friendInvite";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("username, grade_level").eq("id", user.id).maybeSingle();
  if (!profile?.username || !profile.grade_level) return NextResponse.redirect(new URL("/login/complete-profile", request.url));
  const cookieStore = await cookies();
  const destination = invitationDestination(cookieStore.get(FRIEND_INVITE_COOKIE)?.value);
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.delete(FRIEND_INVITE_COOKIE);
  return response;
}
