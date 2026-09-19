export type TrendDay = {
  d: string;
  correct_count: number;
  total_count: number;
  accuracy: number | null;
  has_data: boolean;
};

export type CategoryRow = {
  subject: string;
  branch: string | null;
  chapter_key: string;
  chapter: string;
  answered_count: number;
  accuracy: number;
  tier: string;
};

export type ChapterChange = {
  chapter_key: string;
  subject: string;
  chapter: string;
  current_tier: string | null;
  previous_tier: string | null;
  answered_count_current: number;
  changed: boolean;
};

export type SubjectRow = {
  subject: string;
  branch: string | null;
  answered_count: number;
  accuracy: number;
};

export type CurriculumChapter = {
  chapter_key: string;
  subject: string;
  branch: string | null;
  chapter: string;
  chapter_order: number;
};

export const TIER_RANK: Record<string, number> = {
  ยังต้องฝึก: 0,
  กำลังไปได้: 1,
  คล่องแล้ว: 2,
};

export const SUBJECT_LABEL: Record<string, string> = {
  math: "คณิตศาสตร์",
  science: "วิทยาศาสตร์",
};

export function subjectLabel(subject: string, branch?: string | null): string {
  const base = SUBJECT_LABEL[subject] ?? subject;
  return branch ? `${base} (${branch})` : base;
}

// เกณฑ์เดียวกับ tier ของ guardian_get_categories (>=80 / >=50) ใช้ระบายสีแท่ง accuracy ทุกจุดในหน้า
export function accuracyTextClass(acc: number): string {
  if (acc >= 80) return "text-good";
  if (acc >= 50) return "text-warn";
  return "text-red";
}

export function accuracyBgClass(acc: number): string {
  if (acc >= 80) return "bg-good";
  if (acc >= 50) return "bg-warn";
  return "bg-red";
}

export function tierTagClass(tier: string): string {
  if (tier === "คล่องแล้ว") return "bg-good/15 text-good";
  if (tier === "กำลังไปได้") return "bg-warn/15 text-warn";
  return "bg-red/15 text-red";
}

export function tierBgClass(tier: string): string {
  if (tier === "คล่องแล้ว") return "bg-good";
  if (tier === "กำลังไปได้") return "bg-warn";
  return "bg-red";
}
