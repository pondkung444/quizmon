"use server";

import { createClient } from "@/lib/supabase/server";

// Classroom Boss Raid — Phase 0.1 server actions
// เขียนทุกอย่างผ่าน RPC security definer (create/join) — client ไม่ insert boss_raid_* ตรง
// (pattern เดียวกับ claim_dungeon_run / start_raid_run)

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  return { supabase, user };
}

export type BossRaidConfig = {
  chapter_ids: number[];
  difficulty: "easy" | "medium" | "hard";
  timer_seconds: number;
};

const DEFAULT_CONFIG: BossRaidConfig = {
  chapter_ids: [],
  difficulty: "medium",
  timer_seconds: 30,
};

export async function createBossRaidSession(): Promise<{ sessionId: string; joinCode: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("create_boss_raid_session", { p_config: DEFAULT_CONFIG })
    .single();
  if (error || !data) throw new Error(error?.message ?? "สร้างห้องไม่สำเร็จ");
  const row = data as { id: string; join_code: string };
  return { sessionId: row.id, joinCode: row.join_code };
}

// ครูแก้ค่าห้อง (บท/ความยาก/timer) — เขียน config ตรงผ่าน RLS "teacher update" policy
export async function updateBossRaidConfig(sessionId: string, config: BossRaidConfig): Promise<void> {
  const { supabase } = await requireUser();
  const timer = Math.min(180, Math.max(5, Math.round(config.timer_seconds || 0)));
  const difficulty = (["easy", "medium", "hard"] as const).includes(config.difficulty)
    ? config.difficulty
    : "medium";
  const chapterIds = Array.isArray(config.chapter_ids)
    ? [...new Set(config.chapter_ids.filter((n) => Number.isInteger(n)))]
    : [];

  const { error } = await supabase
    .from("boss_raid_sessions")
    .update({ config: { chapter_ids: chapterIds, difficulty, timer_seconds: timer } })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export type JoinBossRaidResult = {
  sessionId: string;
  status: "lobby" | "in_progress" | "ended";
  joinCode: string;
  participantId: string;
};

export async function joinBossRaidSession(joinCode: string): Promise<JoinBossRaidResult> {
  const { supabase } = await requireUser();
  const code = joinCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("รหัสห้องต้องเป็นตัวอักษร/ตัวเลข 6 หลัก");

  const { data, error } = await supabase.rpc("join_boss_raid_session", { p_join_code: code });
  if (error || !data) throw new Error(error?.message ?? "เข้าห้องไม่สำเร็จ");
  const row = data as {
    session_id: string;
    status: JoinBossRaidResult["status"];
    join_code: string;
    participant_id: string;
  };
  return {
    sessionId: row.session_id,
    status: row.status,
    joinCode: row.join_code,
    participantId: row.participant_id,
  };
}

// Phase 0.2 — ครูกดเริ่มเกม: aggregate stat + คำนวณ HP scaling ผ่าน RPC security definer
// (lobby -> in_progress; client เห็นผ่าน realtime UPDATE ของ boss_raid_sessions)
export async function startBossRaidGame(sessionId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("start_boss_raid_game", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}
