"use server";

import { createClient } from "@/lib/supabase/server";
import { focusErrorMessage } from "@/lib/classroom/focusErrors";
import { FOCUS_EXP_PER_BLOCK } from "@/lib/exp";
import { evolvePet, type PetEvolveOutcome } from "@/lib/petEvolution";

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

// ครูพาห้องกลับ lobby (current_activity = null) หลังกิจกรรมจบ — RPC ปฏิเสธถ้ากิจกรรมยังรันอยู่
// (classroom_activity_busy) จึงใช้ข้อความเฉพาะที่นี่ ไม่แก้ข้อความรวมใน focusErrors
export async function clearClassroomActivity(sessionId: string): Promise<FocusActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return fail("ต้องเข้าสู่ระบบก่อน");
  const { error } = await supabase.rpc("clear_classroom_activity", { p_session_id: sessionId });
  if (error) {
    if (error.message.includes("classroom_activity_busy")) {
      return {
        ok: false,
        error: "กิจกรรมยังไม่จบ — จบกิจกรรมก่อนจึงจะกลับห้องรอได้",
        code: error.message,
      };
    }
    return fail(error.message);
  }
  return { ok: true, data: null };
}

export type FocusResult = {
  completedBlocks: number;
  focusedSeconds: number;
  /** EXP ที่ได้จริงหลังหักเพดานวันนี้ */
  expAwarded: number;
  /** EXP ตามจำนวนก้อน ก่อนหักเพดาน (มากกว่า expAwarded = ชนเพดาน หรือไม่มีตัวที่กำลังเลี้ยง) */
  expEarned: number;
  hasPet: boolean;
  evolution: PetEvolveOutcome | null;
};

// นักเรียนเรียกหลังคาบจบ: อ่านผลของตัวเอง + เช็ควิวัฒนาการของตัวที่ได้ EXP
// (SQL แจก EXP ไปแล้วตอน finalize — ตัวนี้ไม่เขียน exp) evolvePet idempotent เรียกซ้ำได้; หน้า /pet เป็น safety net
// data = null เมื่อไม่ได้อยู่ในรอบนั้น หรือรอบยังไม่ได้ตัดสิน EXP
export async function getFocusResult(focusSessionId: string): Promise<FocusActionResult<FocusResult | null>> {
  const { supabase, user } = await requireUser();
  if (!user) return fail("ต้องเข้าสู่ระบบก่อน");

  const { data: p, error } = await supabase
    .from("classroom_focus_participants")
    .select("completed_blocks, focused_seconds, exp_awarded, exp_awarded_at, exp_pet_id")
    .eq("focus_session_id", focusSessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!p || !p.exp_awarded_at) return { ok: true, data: null };

  let evolution: PetEvolveOutcome | null = null;
  if (p.exp_pet_id && p.exp_awarded > 0) {
    const { data: pet } = await supabase
      .from("pets")
      .select("id, user_id, exp, stage, math_correct, science_correct")
      .eq("id", p.exp_pet_id)
      .maybeSingle();
    if (pet && pet.user_id === user.id) {
      evolution = await evolvePet(
        supabase,
        user.id,
        {
          id: pet.id,
          stage: pet.stage as number,
          math_correct: pet.math_correct as number,
          science_correct: pet.science_correct as number,
        },
        pet.exp as number,
        "/classroom"
      );
    }
  }

  return {
    ok: true,
    data: {
      completedBlocks: p.completed_blocks,
      focusedSeconds: p.focused_seconds,
      expAwarded: p.exp_awarded,
      expEarned: p.completed_blocks * FOCUS_EXP_PER_BLOCK,
      hasPet: !!p.exp_pet_id,
      evolution,
    },
  };
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
