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
  // สไลซ์ 1.2 — รางวัลไข่ Top-N เมื่อชนะบอส (null = ไม่แจกรางวัลรอบนี้)
  reward_egg_type_id: string | null;
  reward_top_n: number | null;
};

// ชนิดไข่ที่ครูเลือกแจกได้ — dynamic query (ห้าม hardcode id, legendary ถูกกรองด้วย tier)
const REWARD_EGG_TIERS = ["common", "rare", "epic"] as const;

const DEFAULT_CONFIG: BossRaidConfig = {
  chapter_ids: [],
  difficulty: "medium",
  timer_seconds: 30,
  reward_egg_type_id: null,
  reward_top_n: 5,
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

  // รางวัล: N clamp 1..50; ชนิดไข่ต้องเป็น null หรือ id ที่ยัง obtainable + tier ที่อนุญาต
  const rewardTopN =
    config.reward_top_n && config.reward_top_n > 0
      ? Math.min(50, Math.max(1, Math.round(config.reward_top_n)))
      : null;

  let rewardEggTypeId: string | null = null;
  if (config.reward_egg_type_id) {
    const { data: egg } = await supabase
      .from("egg_types")
      .select("id")
      .eq("id", config.reward_egg_type_id)
      .in("tier", REWARD_EGG_TIERS as unknown as string[])
      .eq("is_obtainable", true)
      .maybeSingle();
    if (!egg) throw new Error("ชนิดไข่รางวัลไม่ถูกต้อง");
    rewardEggTypeId = egg.id;
  }

  const { error } = await supabase
    .from("boss_raid_sessions")
    .update({
      config: {
        chapter_ids: chapterIds,
        difficulty,
        timer_seconds: timer,
        reward_egg_type_id: rewardEggTypeId,
        reward_top_n: rewardEggTypeId ? rewardTopN : null,
      },
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export type BossRaidRewardRow = {
  participantId: string;
  rank: number;
  totalDamage: number;
  eggTypeId: string;
  eggNameTh: string;
  spritePrefix: string;
};

// ผลรางวัล Top-N ของห้อง (มีแถวเฉพาะตอนชนะและครูตั้งรางวัลไว้) — จอ TV / มือถือ เรียกตอนจบเกม
export async function getBossRaidRewards(sessionId: string): Promise<BossRaidRewardRow[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_boss_raid_rewards", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    participant_id: string;
    rank: number;
    total_damage: number;
    egg_type_id: string;
    egg_name_th: string;
    sprite_prefix: string;
  }>).map((r) => ({
    participantId: r.participant_id,
    rank: r.rank,
    totalDamage: r.total_damage,
    eggTypeId: r.egg_type_id,
    eggNameTh: r.egg_name_th,
    spritePrefix: r.sprite_prefix,
  }));
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
