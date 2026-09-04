import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/push/verifyCronRequest";

export const maxDuration = 60;

// ยิงจาก Supabase pg_cron (ทุก ~15 วิ ผ่าน pg_net) ไม่ใช่ Vercel scheduler —
// เหตุผลเดียวกับ adventure-return: ต้องยิงถี่กว่าที่ Vercel cron รองรับ
// (round timer สั้นสุด = 30 วิ สำหรับการ์ด haste)
//
// ใช้ ADVENTURE_CRON_SECRET ร่วมกับ adventure-return — โปรเจกต์นี้มี pg_cron secret ตัวเดียว
// (verifyCronRequest เช็คแค่ Authorization header ตรง ๆ ไม่สนว่าใครยิงมา)
//
// รองรับทั้ง GET (เรียกมือทดสอบ) และ POST (pg_net ยิงด้วย net.http_post)
async function handle(request: Request) {
  const authError = verifyCronRequest(request, "ADVENTURE_CRON_SECRET");
  if (authError) return authError;

  try {
    const admin = createAdminClient();
    // pvp_gc() = expire คำท้าค้าง + abandon แมตช์ที่ทิ้ง 3 วัน + resolve ยกที่หมดเวลาตอบ
    const { error } = await admin.rpc("pvp_gc");
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron/pvp-gc] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
