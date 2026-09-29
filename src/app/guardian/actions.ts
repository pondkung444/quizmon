"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendGuardianGoalSetPush, sendGuardianQuestMessagePush } from "@/lib/push/guardianEventPush";

// เหมือน signOut() ใน src/app/actions.ts ทุกอย่าง ต่างแค่ redirect ปลายทาง — ของเดิมพาไป /login
// (หน้านักเรียน) ซึ่งผิดบริบทสำหรับผู้ปกครองที่ล็อกอินด้วย Google คนละ flow กันเลย
export async function guardianSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/guardian");
}

// ตั้งเป้าความสม่ำเสมอให้นักเรียน — เรียก RPC ด้วย user client (สิทธิ์ตรวจโดย RPC เหมือนเดิม)
// แล้วแจ้งเด็กด้วย push ถ้าผู้เรียกไม่ใช่เด็กเอง (เด็กตั้งเองแบบ self-serve ไม่ต้อง push ตัวเอง)
export async function guardianSetGoal(
  studentId: string,
  level: "relaxed" | "steady" | "challenging"
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardian_set_goal", { p_student_id: studentId, p_level: level });
  if (error) return { error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && user.id !== studentId) {
    // await ตรงๆ ไม่ปล่อยค้างหลัง response (serverless อาจถูก kill) — sendGuardianGoalSetPush ไม่ throw
    await sendGuardianGoalSetPush(studentId);
  }
  return { error: null };
}

// เลือกข้อความ preset ที่จะแสดงคู่กับโจทย์จากแผน (null = ล้าง) — RPC ตรวจสิทธิ์เอง
// push เฉพาะตอนตั้งข้อความ (ไม่ push ตอนล้าง) และเฉพาะเมื่อผู้เรียกไม่ใช่เด็กเอง
export async function guardianSetQuestMessage(
  studentId: string,
  messageId: number | null
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardian_set_quest_message", {
    p_student_id: studentId,
    p_message_id: messageId,
  });
  if (error) return { error: error.message };

  if (messageId !== null) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && user.id !== studentId) {
      await sendGuardianQuestMessagePush(studentId);
    }
  }
  return { error: null };
}
