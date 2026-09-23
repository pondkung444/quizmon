"use server";

import { createClient } from "@/lib/supabase/server";

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

export async function createClassroomSession(): Promise<{ sessionId: string; joinCode: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_classroom_session").single();
  if (error || !data) throw new Error(error?.message ?? "เปิดห้องไม่สำเร็จ");
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
  if (error) throw new Error(error.message);
}

export type PickedStudent = { userId: string; username: string | null };

export async function pickRandomStudent(sessionId: string): Promise<PickedStudent> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("pick_random_student", { p_session_id: sessionId })
    .single();
  if (error || !data) throw new Error(error?.message ?? "สุ่มรายชื่อไม่สำเร็จ");
  const row = data as { user_id: string; username: string | null };
  return { userId: row.user_id, username: row.username };
}

export async function launchBossRaidFromClassroom(
  sessionId: string
): Promise<{ bossRaidSessionId: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("launch_boss_raid_from_classroom", { p_session_id: sessionId })
    .single();
  if (error || !data) throw new Error(error?.message ?? "เปิด Boss Raid ไม่สำเร็จ");
  const row = data as { id: string };
  return { bossRaidSessionId: row.id };
}
