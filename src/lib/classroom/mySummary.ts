// shape ของ jsonb จาก get_classroom_my_summary (supabase/migrations/20260925150000_classroom_student_lobby_v3.sql)
// ผลของ "ฉัน" ในคาบเดียว — หน้าห้องฝั่งนักเรียนใช้โชว์ว่าคาบนี้ทำอะไรไปแล้ว ได้อะไรมา

export type MyRaid = {
  id: string;
  status: "lobby" | "in_progress" | "ended";
  result: "win" | "lose" | "incomplete" | null;
  at: string;
  joined: boolean;
  answers: number;
  correct: number;
  players: number;
  reward: { rank: number; egg_name_th: string; sprite_prefix: string } | null;
};

export type MyFocus = {
  id: string;
  running: boolean;
  at: string;
  minutes: number;
  joined: boolean;
  focused_seconds: number;
  exp: number;
};

export type MyClassroomSummary = {
  pet_id: string | null;
  raids: MyRaid[];
  focus: MyFocus[];
  picks_total: number;
  picked_me: number;
};

export type MyTotals = {
  answers: number;
  correct: number;
  focusMinutes: number;
  exp: number;
  eggs: number;
  activities: number;
};

export function summarizeMine(s: MyClassroomSummary): MyTotals {
  let answers = 0;
  let correct = 0;
  let eggs = 0;
  for (const r of s.raids) {
    answers += r.answers;
    correct += r.correct;
    if (r.reward) eggs += 1;
  }
  let focusSeconds = 0;
  let exp = 0;
  for (const f of s.focus) {
    focusSeconds += f.focused_seconds;
    exp += f.exp;
  }
  return {
    answers,
    correct,
    focusMinutes: Math.round(focusSeconds / 60),
    exp,
    eggs,
    activities: s.raids.length + s.focus.length + (s.picks_total > 0 ? 1 : 0),
  };
}

// ไทม์ไลน์กิจกรรมเรียงตามเวลา (สุ่มชื่อไม่มีเวลาต่อครั้ง — สรุปเป็นแถวเดียวท้ายสุด)
export type TimelineItem =
  | { kind: "raid"; at: string; raid: MyRaid }
  | { kind: "focus"; at: string; focus: MyFocus };

export function buildTimeline(s: MyClassroomSummary): TimelineItem[] {
  const items: TimelineItem[] = [
    ...s.raids.map((raid) => ({ kind: "raid" as const, at: raid.at, raid })),
    ...s.focus.map((focus) => ({ kind: "focus" as const, at: focus.at, focus })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}
