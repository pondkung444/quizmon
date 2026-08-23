import { NextResponse } from "next/server";

/**
 * Vercel แนบ Authorization: Bearer $CRON_SECRET มาอัตโนมัติเวลาเรียก cron job
 * (ถ้าตั้งค่า env CRON_SECRET ไว้) — เช็คตรงนี้กัน route ถูกยิงจากภายนอกตรงๆ
 * คืน NextResponse (401) ถ้าไม่ผ่าน, คืน null ถ้าผ่าน — เรียกใช้แล้ว early-return ถ้าไม่ null
 */
export function verifyCronRequest(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET env var ไม่ได้ตั้งค่า — ปฏิเสธ request ทั้งหมด");
    return NextResponse.json({ error: "cron not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
