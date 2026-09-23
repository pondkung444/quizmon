"use server";

import { createClient } from "@/lib/supabase/server";
import { focusErrorMessage } from "@/lib/classroom/focusErrors";

// คาบตั้งใจ (Focus Mode) Phase 1 — เขียนผ่าน RPC security definer เท่านั้น
// คืนเป็น result object (ไม่ throw) เพราะ Next production ซ่อนข้อความของ Error ที่ throw จาก server action
// — error ที่คืนไปพร้อม code เดิมให้ client ตัดสินใจ (เช่น focus_session_not_running เงียบได้)

export type FocusActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function fail(raw: string | null | undefined): { ok: false; error: string; code: string } {
  return { ok: false, error: focusErrorMessage(raw), code: raw ?? "unknown" };
}

export async function launchFocusMode(sessionId: string): Promise<FocusActionResult<{ focusSessionId: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return fail("ต้องเข้าสู่ระบบก่อน");
  const { data, error } = await supabase
    .rpc("launch_focus_mode_from_classroom", { p_session_id: sessionId })
    .single();
  if (error || !data) return fail(error?.message ?? "เริ่มคาบตั้งใจไม่สำเร็จ");
  return { ok: true, data: { focusSessionId: (data as { id: string }).id } };
}

export async function endFocusMode(focusSessionId: string): Promise<FocusActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return fail("ต้องเข้าสู่ระบบก่อน");
  const { error } = await supabase.rpc("end_focus_mode_session", {
    p_focus_session_id: focusSessionId,
  });
  if (error) return fail(error.message);
  return { ok: true, data: null };
}

export async function joinFocusSession(focusSessionId: string): Promise<FocusActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return fail("ต้องเข้าสู่ระบบก่อน");
  const { error } = await supabase.rpc("join_focus_session", {
    p_focus_session_id: focusSessionId,
  });
  if (error) return fail(error.message);
  return { ok: true, data: null };
}
