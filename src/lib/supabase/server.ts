import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// cache() = memo ต่อ 1 request เท่านั้น (layout กับ page render อยู่ใน request เดียวกัน)
// ไม่มีทางแชร์ client/user ข้าม request ของคนละคน
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ถูกเรียกจาก Server Component — middleware จะ refresh session แทน
          }
        },
      },
    }
  );
});

// auth.getUser() คือ network round-trip ไป Supabase Auth ทุกครั้ง — ก่อนหน้านี้ layout + page
// เรียกซ้ำกันเองทุก request กลายเป็น 2 round-trip ต่อการเปิดหน้าเดียว ใช้ตัวนี้แทนการเรียก
// supabase.auth.getUser() ตรงๆ ใน Server Component เพื่อให้ทั้ง request แชร์ผลครั้งเดียวกัน
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
