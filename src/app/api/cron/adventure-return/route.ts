import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/push/verifyCronRequest";
import { isWithinQuietHours } from "@/lib/push/quietHours";
import { sendAdventureReturnPushes } from "@/lib/push/adventureReturn";

export const maxDuration = 60;

// ยิงมาจาก Supabase pg_cron (ทุก 5-10 นาที ผ่าน pg_net) ไม่ใช่จาก Vercel cron scheduler
// โดยตรง — เหตุผล: Vercel Hobby cron ยิงได้แค่วันละครั้ง/job ไม่พอสำหรับ event ที่ต้อง
// detect แบบ near-real-time (ผจญภัยจบได้ตลอด 24 ชม.) ใช้ CRON_SECRET เดียวกับ cron อื่น
// (verifyCronRequest เช็คแค่ Authorization header ตรงๆ ไม่สนว่าใครเป็นคนยิงมา)
//
// ช่วงพักกลางคืน (quiet hours): ถ้าเช็คแล้วอยู่ในช่วงพัก ให้ข้ามรอบนี้ไปเฉยๆ โดยไม่แตะ
// dungeon_runs เลย — รอบถัดไปหลังพ้นช่วงพักจะมาเจอ run เดิม (ยัง claimed_at is null)
// แล้วส่งให้เอง เป็นการ "เลื่อนส่ง" แบบธรรมชาติโดยไม่ต้องมี scheduled_for column เพิ่ม
export async function GET(request: Request) {
  const authError = verifyCronRequest(request, "ADVENTURE_CRON_SECRET");
  if (authError) return authError;

  if (isWithinQuietHours()) {
    return NextResponse.json({ ok: true, skipped: "quiet_hours" });
  }

  try {
    const admin = createAdminClient();
    const summary = await sendAdventureReturnPushes(admin);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[cron/adventure-return] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}

// pg_cron ยิง route นี้ด้วย net.http_post (HTTP POST) — Next route handler จะ 405 ทุก method
// ที่ไม่ได้ export ไว้ ทำให้ cron นี้ 405 มาตลอดตั้งแต่ deploy. POST = GET เดิม (auth เหมือนกัน)
export const POST = GET;
