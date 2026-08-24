import { NextResponse } from "next/server";

/**
 * Vercel แนบ Authorization: Bearer $CRON_SECRET มาอัตโนมัติเวลาเรียก cron job
 * (ถ้าตั้งค่า env CRON_SECRET ไว้) — เช็คตรงนี้กัน route ถูกยิงจากภายนอกตรงๆ
 * คืน NextResponse (401) ถ้าไม่ผ่าน, คืน null ถ้าผ่าน — เรียกใช้แล้ว early-return ถ้าไม่ null
 *
 * envVarName: ปกติใช้ค่า default "CRON_SECRET" (Vercel auto-inject ให้เวลา scheduler ของ
 * Vercel เองเป็นคนยิง) — แต่ route ที่ถูกยิงจาก Supabase pg_cron แทน (เช่น adventure-return
 * ที่ต้อง detect ถี่กว่า Vercel Hobby cron รองรับ) ควรใช้ env var แยกของตัวเอง เพราะ Vercel
 * ไม่ได้เป็นคนเรียก จึงไม่มี CRON_SECRET แนบมาให้อัตโนมัติ
 */
export function verifyCronRequest(
  request: Request,
  envVarName: string = "CRON_SECRET"
): NextResponse | null {
  const secret = process.env[envVarName];
  if (!secret) {
    console.error(`[cron] ${envVarName} env var ไม่ได้ตั้งค่า — ปฏิเสธ request ทั้งหมด`);
    return NextResponse.json({ error: "cron not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
