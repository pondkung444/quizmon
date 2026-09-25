"use server";

import { createClient } from "@/lib/supabase/server";
import { focusErrorMessage } from "@/lib/classroom/focusErrors";
import { classroomErrorMessage } from "@/lib/classroom/roster";

// Teacher Classroom Hub Phase 1 — เขียนทุกอย่างผ่าน RPC security definer เท่านั้น
// (pattern เดียวกับ src/app/boss-raid/actions.ts)

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  return { supabase, user };
}

export async function createClassroomSession(
  title?: string
): Promise<{ sessionId: string; joinCode: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("create_classroom_session", { p_title: title?.trim() || null })
    .single();
  if (error || !data) throw new Error(focusErrorMessage(error?.message, "เปิดห้องไม่สำเร็จ"));
  const row = data as { id: string; join_code: string };
  return { sessionId: row.id, joinCode: row.join_code };
}

export async function endClassroomSession(sessionId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("end_classroom_session", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

export async function setClassroomActivityNamePicker(sessionId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_classroom_activity_name_picker", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(focusErrorMessage(error.message));
}

export async function renameClassroomSession(sessionId: string, title: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("rename_classroom_session", {
    p_session_id: sessionId,
    p_title: title,
  });
  if (error) throw new Error(focusErrorMessage(error.message));
}

export async function kickClassroomParticipant(sessionId: string, userId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("kick_classroom_participant", {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) throw new Error(focusErrorMessage(error.message));
}

export type PickedStudent = {
  userId: string;
  username: string | null;
  displayName: string | null;
  studentNumber: number | null;
};

// candidateIds = คนที่ออนไลน์อยู่ตาม Presence ฝั่งครู — RPC fallback ทั้งห้องถ้ากรองแล้วว่าง
export async function pickRandomStudent(
  sessionId: string,
  candidateIds?: string[]
): Promise<PickedStudent> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("pick_random_student", {
      p_session_id: sessionId,
      p_candidate_ids: candidateIds && candidateIds.length > 0 ? candidateIds : null,
    })
    .single();
  if (error || !data) throw new Error(classroomErrorMessage(error?.message, "สุ่มรายชื่อไม่สำเร็จ"));
  const row = data as {
    user_id: string;
    username: string | null;
    display_name: string | null;
    student_number: number | null;
  };
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    studentNumber: row.student_number,
  };
}

export async function launchBossRaidFromClassroom(
  sessionId: string
): Promise<{ bossRaidSessionId: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("launch_boss_raid_from_classroom", { p_session_id: sessionId })
    .single();
  if (error || !data) throw new Error(focusErrorMessage(error?.message, "เปิด Boss Raid ไม่สำเร็จ"));
  const row = data as { id: string };
  return { bossRaidSessionId: row.id };
}

// ---- ห้องเรียนถาวร (ม.3/1 ฯลฯ) — migration 20260925120000_teacher_classes_dashboard ----

const CLASS_ERRORS: Array<[code: string, message: string]> = [
  ["class_name_taken", "มีห้องชื่อนี้อยู่แล้ว"],
  ["invalid_class_name", "ตั้งชื่อห้อง 1–60 ตัวอักษร"],
];

function classErrorMessage(raw: string | null | undefined, fallback: string): string {
  if (raw) {
    for (const [code, message] of CLASS_ERRORS) if (raw.includes(code)) return message;
  }
  return focusErrorMessage(raw, fallback);
}

export async function createTeacherClass(name: string): Promise<{ classId: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_teacher_class", { p_name: name }).single();
  if (error || !data) throw new Error(classErrorMessage(error?.message, "เพิ่มห้องไม่สำเร็จ"));
  return { classId: (data as { id: string }).id };
}

export async function renameTeacherClass(classId: string, name: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("rename_teacher_class", { p_class_id: classId, p_name: name });
  if (error) throw new Error(classErrorMessage(error.message, "เปลี่ยนชื่อไม่สำเร็จ"));
}

export async function archiveTeacherClass(classId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("archive_teacher_class", { p_class_id: classId });
  if (error) throw new Error(classErrorMessage(error.message, "ซ่อนห้องไม่สำเร็จ"));
}

export type StartClassResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "other_session_open" };

// มีคาบของห้องนี้เปิดอยู่ → ได้ห้องเดิมคืน; มีคาบห้องอื่นค้าง → ให้ UI ถามครูก่อน แล้วเรียกซ้ำด้วย endOtherOpen
export async function startClassSession(
  classId: string,
  endOtherOpen = false
): Promise<StartClassResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("start_class_session", { p_class_id: classId, p_end_other_open: endOtherOpen })
    .single();
  if (error?.message.includes("other_session_open")) return { ok: false, reason: "other_session_open" };
  if (error || !data) throw new Error(classErrorMessage(error?.message, "เริ่มคาบไม่สำเร็จ"));
  return { ok: true, sessionId: (data as { id: string }).id };
}
