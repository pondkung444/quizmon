import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

// ระบบท้าทายยังไม่เปิดให้นักเรียนเห็น — ไม่มีปุ่มเข้าจากหน้าไหนเลย และปิดทั้งหน้านี้ตรงๆ ด้วย
// (ซ่อนปุ่มอย่างเดียวไม่พอ กลุ่ม stage 4 คือกลุ่มที่จะลองเดา URL มากที่สุด)
//
// ⚠️ ปิดใช้งานทั้งหน้าชั่วคราว (2026-08-09) — แม้อยู่ใน raid_allowlist หรือมีรันค้างอยู่ก็เข้าไม่ได้
// (เจอเคส own_run หลุดผ่านปุ่ม "กลับไปต่อ" ที่ยังไม่ได้ปิดมาก่อน) กันทุกทางเข้ารวมถึง URL ตรงๆ
// โค้ดจริงของหน้านี้ (allowlist/resume/predeparture) อยู่ใน git history — เอากลับมาทีหลังตอนพร้อมเปิด
export default async function RaidPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  redirect("/pet");
}
