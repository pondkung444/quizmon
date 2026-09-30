import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Standalone forest trial; no account data is read or changed.
  if (pathname === "/2048" || pathname === "/2048/") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/2048/index.html";
    return NextResponse.rewrite(destination);
  }
  if (pathname.startsWith("/2048/")) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
