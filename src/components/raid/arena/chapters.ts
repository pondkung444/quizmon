// Chapter list for the arena prep sheet. Pure so it can be tested without the app.
export type RaidChapter = {
  key: string;
  chapter: string;
  subject: string;
  subjectLabel: string;
  gradeLevel: string | null;
  questionCount: number;
  ownGrade: boolean;
};

export type RaidChapterList = { gradeLevel: string | null; auto: string[]; chapters: RaidChapter[] };

export type RaidChapterGroup = { title: string; chapters: RaidChapter[] };

export const MAX_RAID_CHAPTERS = 3;
export const MIXED_GROUP_TITLE = "ทบทวนรวม";

// Own grade first, then the other grades in the order the RPC returns them, then chapters with no
// grade. Those carry grade_order 0, so the RPC can sort them ahead of real grades: never trust it for them.
export function groupRaidChapters(list: RaidChapterList): RaidChapterGroup[] {
  const own = list.gradeLevel;
  const byGrade = new Map<string, RaidChapter[]>();
  const mixed: RaidChapter[] = [];
  for (const c of list.chapters) {
    if (!c.gradeLevel) { mixed.push(c); continue; }
    if (!byGrade.has(c.gradeLevel)) byGrade.set(c.gradeLevel, []);
    byGrade.get(c.gradeLevel)!.push(c);
  }
  const grades = [...byGrade.keys()];
  const ordered = own && byGrade.has(own) ? [own, ...grades.filter((g) => g !== own)] : grades;
  const groups = ordered.map((g) => ({ title: g === own ? `${g} ชั้นของเรา` : g, chapters: byGrade.get(g)! }));
  if (mixed.length) groups.push({ title: MIXED_GROUP_TITLE, chapters: mixed });
  return groups;
}

// Toggling in the sheet: the first pick replaces the auto set, removing the last one goes back to auto.
export function toggleRaidChapter(sel: { auto: boolean; keys: string[] }, key: string): { auto: boolean; keys: string[] } {
  const keys = sel.auto ? [] : sel.keys;
  if (keys.includes(key)) {
    const next = keys.filter((k) => k !== key);
    return next.length ? { auto: false, keys: next } : { auto: true, keys: [] };
  }
  if (keys.length >= MAX_RAID_CHAPTERS) return sel;
  return { auto: false, keys: [...keys, key] };
}

export function changedFromAuto(auto: string[], sel: { auto: boolean; keys: string[] }): boolean {
  if (sel.auto) return false;
  return sel.keys.length !== auto.length || sel.keys.some((k) => !auto.includes(k));
}
