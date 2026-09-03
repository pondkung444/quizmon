// boss_raid_sessions.active_event — broadcast ทั้งแถวผ่าน realtime ทุกจอ (lobby/มือถือ/TV)
// ⚠️ ไม่มี correct_index ในทุก variant (ดู migration 20260831120000 / 20260903140000)

export type BossRaidActiveEvent =
  | null
  | { type: "weak_point"; expires_at: string }
  | {
      type: "meteor";
      question_id: number;
      question_text: string;
      choices: string[];
      expires_at: string;
      winner_participant_id: string | null;
    }
  | {
      // Phase 2 — ไม่มี expires_at (จบด้วยคนที่ถูกเลือกตอบ / ครูกดข้าม)
      type: "chosen_warrior";
      started_at: string;
      chosen_participant_id: string;
      chosen_name: string;
      criterion: "single" | "total";
      stat_key: "hp" | "atk" | "def" | "spd" | "foc" | null;
      stat_value: number;
      question_id: number;
      question_text: string;
      choices: string[];
    };

// event ที่ยัง "มีผล" ตอนนี้ — weak_point/meteor หมดอายุเองตาม expires_at,
// chosen_warrior ไม่มี expires_at (อยู่จนกว่า active_event จะถูกเคลียร์เป็น null)
export function liveBossRaidEvent(
  ev: BossRaidActiveEvent,
  nowMs: number
): BossRaidActiveEvent {
  if (!ev) return null;
  if (ev.type === "chosen_warrior") return ev;
  return tsMs(ev.expires_at) > nowMs ? ev : null;
}

// expires_at เก็บเป็น (now() + interval 'N seconds')::text — "2026-09-02 06:15:30.123+00"
// (space คั่น, offset "+00") ไม่ใช่ ISO เป๊ะ บาง engine parse ไม่ได้ -> normalize ก่อน
export function tsMs(s: string): number {
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.parse(s.replace(" ", "T")) : t;
}
