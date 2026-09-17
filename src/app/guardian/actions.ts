"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// เหมือน signOut() ใน src/app/actions.ts ทุกอย่าง ต่างแค่ redirect ปลายทาง — ของเดิมพาไป /login
// (หน้านักเรียน) ซึ่งผิดบริบทสำหรับผู้ปกครองที่ล็อกอินด้วย Google คนละ flow กันเลย
export async function guardianSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/guardian");
}
