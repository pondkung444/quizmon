import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { sendPushToDevice } from "@/lib/push/sendPush";

// Endpoint ทดสอบ Rich Notification (ภาพ Qmon แนบ push) บน Android — ยิงเฉพาะไปที่
// push_devices ของ "ตัวเอง" (ผู้เรียก) เท่านั้น ไม่แตะ eligibility/cron/user คนอื่นเลย
// ลบทิ้งได้หลังยืนยันว่า Android แสดงภาพถูกต้องแล้ว — เป็น throwaway verification tool
// ไม่ใช่ของที่ตั้งใจให้ค้างอยู่ใน production ระยะยาว
export async function GET() {
  const user = await getUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const userEmail = user?.email?.toLowerCase();
  if (!userEmail || !adminEmails.includes(userEmail)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: devices, error: devicesError } = await supabase
    .from("push_devices")
    .select("id, fcm_token, platform")
    .eq("user_id", user!.id)
    .eq("enabled", true);
  if (devicesError) {
    return NextResponse.json({ ok: false, error: devicesError.message }, { status: 500 });
  }
  if (!devices || devices.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ไม่พบ push_devices ที่ enabled=true สำหรับบัญชีนี้ — เปิดแอปบนอุปกรณ์ทดสอบแล้ว grant permission ใหม่ก่อน" },
      { status: 404 }
    );
  }

  // รูปทดสอบ: egg4 = ไข่ฤทธิ์ธาร (หมีน้ำแข็ง) stage4 balance-A — asset ที่มีแน่นอนในระบบ
  // (ยืนยันจาก public/pets/ จริง) ไม่ผูกกับ pet จริงของ user แค่ใช้เช็คว่า Rich Notification แสดงภาพได้
  const testImageUrl = "https://quizmon.xyz/pets/egg4_stage4_balance_A.png";

  const results = await Promise.all(
    devices.map(async (d) => {
      const result = await sendPushToDevice({
        token: d.fcm_token,
        title: "ทดสอบ Rich Notification 🐻‍❄️",
        body: "ถ้าเห็นรูปหมีน้ำแข็งแนบมาด้วย แปลว่า Android แสดงภาพได้จริงแล้ว",
        deepLink: "/pet",
        imageUrl: testImageUrl,
      });
      return { deviceId: d.id, platform: d.platform, result };
    })
  );

  return NextResponse.json({ ok: true, sentTo: results });
}
