import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Public static shell; account reads authenticate in /api/2048 handlers.
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
