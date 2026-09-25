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
