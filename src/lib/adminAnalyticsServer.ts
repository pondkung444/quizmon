import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyticsWindow, eligibleProfiles, type AnalyticsAttempt, type AnalyticsProfile, type AnalyticsQuestion } from "@/lib/adminAnalytics";

const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null };
async function readPages<T>(name: string, read: (from: number, to: number) => PromiseLike<Page<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await read(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Gate access in the page before calling this privileged reader.
export async function loadAdminAnalytics(now = Date.now()) {
  const admin = createAdminClient();
  const since = new Date(analyticsWindow(now).detailMs).toISOString();
  const until = new Date(now).toISOString();
  const adminEmails = new Set([process.env.ADMIN_EMAILS, process.env.ANALYTICS_ADMIN_EMAILS]
    .flatMap((value) => (value ?? "").split(",")).map((value) => value.trim().toLowerCase()).filter(Boolean));
  async function excludedAdmins() {
    const ids = new Set<string>();
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error) throw new Error(`admin users: ${error.message}`);
      for (const user of data.users) if (user.email && adminEmails.has(user.email.toLowerCase())) ids.add(user.id);
      if (data.users.length < PAGE_SIZE) return ids;
    }
  }
  const [profiles, attempts, excludedIds] = await Promise.all([
    readPages<AnalyticsProfile>("profiles", (from, to) => admin.from("profiles")
      .select("id, username, grade_band, grade_level, school").order("id").range(from, to)),
    readPages<AnalyticsAttempt>("quiz attempts", (from, to) => admin.from("quiz_attempts")
      .select("user_id, is_correct, created_at, question_id, source")
      .gte("created_at", since).lte("created_at", until).order("id").range(from, to)),
    excludedAdmins(),
  ]);
  const questionIds = [...new Set(attempts.map((a) => a.question_id).filter((id): id is number => id != null))];
  const questions: AnalyticsQuestion[] = [];
  // Limit each IN query below the PostgREST row cap. Fetch only questions referenced in this window.
  for (let from = 0; from < questionIds.length; from += 500) {
    const { data, error } = await admin.from("questions").select("id, category, grade_band")
      .in("id", questionIds.slice(from, from + 500));
    if (error) throw new Error(`questions: ${error.message}`);
    questions.push(...(data ?? []) as AnalyticsQuestion[]);
  }
  return { profiles: eligibleProfiles(profiles, excludedIds), attempts, questions, now };
}
