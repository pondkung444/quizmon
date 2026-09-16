import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { FRIEND_INVITE_COOKIE, invitationDestination } from "@/lib/friendInvite";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = invitationDestination(code);
  if (destination === "/pet") return NextResponse.redirect(new URL("/social/add-friend", url));
  const user = await getUser();
  const response = NextResponse.redirect(new URL(user ? destination : "/login", url));
  response.headers.set("Cache-Control", "private, no-store");
  if (!user) response.cookies.set(FRIEND_INVITE_COOKIE, code!.toUpperCase(), {
    httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 1800,
  });
  else response.cookies.delete(FRIEND_INVITE_COOKIE);
  return response;
}
