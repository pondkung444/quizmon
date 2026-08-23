import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // ส่ง pathname ปัจจุบันต่อให้ Server Component อ่านผ่าน headers() ได้ — root layout.tsx ใช้
  // เช็คว่าควรบังคับ redirect ไป /login/complete-profile ไหม (layout เองไม่มีทางรู้ pathname)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/login");
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next");
  const isCronRoute = request.nextUrl.pathname.startsWith("/api/cron");
  const isPrivacyPage = request.nextUrl.pathname.startsWith("/privacy");

  if (
    !user &&
    !isAuthPage &&
    !isPublicAsset &&
    !isCronRoute &&
    !isPrivacyPage &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // /admin/* กันด้วย whitelist email ผ่าน env var (ยังไม่มี role ใน profiles) — ถึงตรงนี้ user
  // ล็อกอินแล้วแน่ๆ (เช็ค !user ด้านบนดักไปแล้ว) เหลือแค่เช็คว่า email อยู่ใน allowlist ไหม
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const userEmail = user?.email?.toLowerCase();

    if (!userEmail || !adminEmails.includes(userEmail)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
