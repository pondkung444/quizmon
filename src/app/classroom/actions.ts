"use server";

import { createClient } from "@/lib/supabase/server";

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
  const code = joinCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("รหัสห้องต้องเป็นตัวอักษร/ตัวเลข 6 หลัก");

  const { data, error } = await supabase
    .rpc("join_classroom_session", { p_join_code: code })
    .single();
  if (error || !data) throw new Error(error?.message ?? "เข้าห้องไม่สำเร็จ");
  const row = data as { id: string };
  return { sessionId: row.id };
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
