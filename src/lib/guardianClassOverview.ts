import type { createClient } from "@/lib/supabase/server";

// ผลของ guardian_get_class_overview() — ภาพรวมนักเรียนทุกคนที่ผู้ปกครอง/ครูดูแล (หน้าแรก /guardian)
export type ClassStudentStatus = "ok" | "low" | "gone";

export type ClassStudent = {
  student_id: string;
  username: string;
  grade_level: string | null;
  today_q: number;
  today_correct: number;
  last_active: string | null;
  days_since: number | null;
  q7: number[];
  total7: number;
  acc7: number | null;
  goal_level: string | null;
  goal_target: number | null;
  goal_points: number | null;
  status: ClassStudentStatus;
};

export type ClassDay = { d: string; active: number; q: number; correct: number };
export type ClassWeek = { active_avg: number; q: number; correct: number };
export type ClassChapter = {
  subject: string;
  branch: string | null;
  chapter: string;
  n: number;
  students: number;
  acc: number;
};

export type ClassOverview = {
  today: string;
  grades: string[];
  students: ClassStudent[];
  daily: ClassDay[];
  compare: { this: ClassWeek; prev: ClassWeek };
  chapters_good: ClassChapter[];
  chapters_bad: ClassChapter[];
};

// คืน null ถ้า error — ผู้เรียกต้องเช็ค access (getGuardianAccess) ก่อน หน้านี้ต้องไม่ล่มเพราะข้อมูลรวมพัง
export async function getClassOverview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  grade: string | null
): Promise<ClassOverview | null> {
  try {
    const { data, error } = await supabase.rpc("guardian_get_class_overview", { p_grade: grade });
    if (error || !data) {
      if (error) console.error("guardian_get_class_overview failed:", error.message);
      return null;
    }
    return data as ClassOverview;
  } catch (err) {
    console.error("guardian_get_class_overview threw:", err);
    return null;
  }
}
