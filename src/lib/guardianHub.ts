import type { createClient } from "@/lib/supabase/server";

// ผลของ guardian_get_my_hub() — ศูนย์ผู้พิทักษ์ฝั่งเด็ก (อ่านอย่างเดียว, เฉพาะของตัวเอง)
export type GuardianHubPlanSubject = {
  subject: "math" | "science";
  current_chapter: string | null;
  position: number;
  total: number;
  done: boolean;
};

export type GuardianHub = {
  goal: {
    level: "relaxed" | "steady" | "challenging";
    total_points: number;
    target: number;
    reached: boolean;
  } | null;
  reward: {
    reached_weeks: number;
    next_frame_id: string | null;
    weeks_to_next: number | null;
  } | null;
  plan: {
    framework: "school" | "weak_spot" | "exam_prep";
    duration_weeks: number;
    exam_date: string | null;
    subjects: GuardianHubPlanSubject[];
  } | null;
  // เฟส 2: วันนี้พักโหมดทบทวนอยู่ไหม (เวลาไทย) — เด็กกดพักเอง หรือผ่านบทแล้ว
  review_paused_today: "student_closed" | "chapter_passed" | null;
  // เฟส 4: ข้อความ preset ที่ผู้พิทักษ์เลือกไว้ (อ่านซ้ำได้) — null = ไม่ได้เลือก
  quest_message: string | null;
};

export const SUBJECT_LABEL_TH: Record<string, string> = {
  math: "คณิตศาสตร์",
  science: "วิทยาศาสตร์",
};

// คืน null ถ้า error / ไม่มีผู้พิทักษ์ claimed — ผู้เรียกต้องเช็ค is_guardian_admin ก่อนเรียกเสมอ
// (RPC raise ถ้าไม่อยู่ใน allowlist) ห้าม throw: ศูนย์นี้เป็นของเสริม พังต้องไม่ลากหน้าหลักล่ม
export async function getMyGuardianHub(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<GuardianHub | null> {
  try {
    const { data, error } = await supabase.rpc("guardian_get_my_hub");
    if (error || !data || data.has_guardian !== true) return null;
    return {
      goal: data.goal ?? null,
      reward: data.reward ?? null,
      plan: data.plan ?? null,
      review_paused_today: data.review_paused_today ?? null,
      quest_message: data.quest_message ?? null,
    };
  } catch {
    return null;
  }
}
