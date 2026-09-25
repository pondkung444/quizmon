"use server";

import { createClient } from "@/lib/supabase/server";
import { checkProfanity } from "@/lib/moderation";
import { classroomErrorMessage } from "@/lib/classroom/roster";
import type { MyClassroomSummary } from "@/lib/classroom/mySummary";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  return { supabase, user };
}

export async function joinClassroomSession(joinCode: string): Promise<{ sessionId: string }> {
  const { supabase } = await requireUser();
  // ตัดช่องว่าง/ขีดออก ("482 915", "482-915") — รหัสใหม่เป็นตัวเลขล้วน, ห้องเก่ายังเป็น A-Z0-9
  const code = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("รหัสห้องมี 6 หลัก");

  const { data, error } = await supabase
    .rpc("join_classroom_session", { p_join_code: code })
    .single();
  if (error || !data) throw new Error(classroomErrorMessage(error?.message, "เข้าห้องไม่สำเร็จ ลองใหม่อีกครั้ง"));
  const row = data as { id: string };
  return { sessionId: row.id };
}

// ชื่อจริง + เลขที่ ที่ครูเห็นในห้องนี้ (username เป็นชื่อเล่นที่เด็กตั้งเอง ครูไม่รู้ว่าเป็นใคร)
export async function setClassroomIdentity(
  sessionId: string,
  displayName: string,
  studentNumber: number | null
): Promise<void> {
  const { supabase } = await requireUser();
  const name = displayName.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) throw new Error("กรอกชื่อ 1–40 ตัวอักษร");
  if (studentNumber !== null && (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 99)) {
    throw new Error("เลขที่ต้องอยู่ระหว่าง 1–99");
  }
  const { blocked } = await checkProfanity(name, { useAI: true });
  if (blocked) throw new Error("ชื่อนี้ใช้ไม่ได้ ลองใช้ชื่อจริงของตัวเอง");

  const { error } = await supabase.rpc("set_classroom_identity", {
    p_session_id: sessionId,
    p_display_name: name,
    p_student_number: studentNumber,
  });
  if (error) throw new Error(classroomErrorMessage(error.message, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"));
}

// นักเรียนใน classroom ยังไม่ใช่ boss_raid_participant มาก่อน จึงยังไม่ผ่าน is_boss_raid_member()
// ของ RLS เดิม — ใช้ RPC get_boss_raid_join_code() ที่เช็คแค่ classroom membership แทน
export async function getBossRaidJoinCodeForClassroom(bossRaidSessionId: string): Promise<string> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_boss_raid_join_code", {
    p_boss_raid_session_id: bossRaidSessionId,
  });
  if (error || !data) throw new Error(error?.message ?? "ดึงรหัสห้องไม่สำเร็จ");
  return data as string;
}

// ผลของตัวเองในคาบนี้ (Raid / คาบตั้งใจ / ถูกสุ่มชื่อ) — null ถ้าโหลดไม่ได้ (หน้ายังใช้งานได้โดยซ่อนส่วนนี้)
export async function getClassroomMySummary(sessionId: string): Promise<MyClassroomSummary | null> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_classroom_my_summary", { p_session_id: sessionId });
  if (error || !data) {
    console.error("get_classroom_my_summary failed:", error?.message);
    return null;
  }
  return data as MyClassroomSummary;
}

// Qmon ประจำคาบ (stage 4) — ใช้ลง Boss Raid ที่ครูเปิดจากคาบนี้; null = ใช้ตัวที่เลี้ยงอยู่
export async function setClassroomPet(sessionId: string, petId: string | null): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_classroom_pet", {
    p_session_id: sessionId,
    p_pet_id: petId,
  });
  if (error) {
    if (error.message.includes("invalid_classroom_pet")) throw new Error("เลือกได้เฉพาะ Qmon ที่โตเต็มวัย");
    throw new Error(classroomErrorMessage(error.message, "เปลี่ยน Qmon ไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }
}
