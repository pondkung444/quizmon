import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/pagination";

type QuestionRow = {
  id: number; question_text: string; choices: string[]; correct_index: number;
  image_url: string | null; explanation: string | null;
};

// Read only. Do not call submitAnswer/startQuizRound: this mode must not affect
// learning counters, daily missions, EXP, or currencies in the main app.
export async function forestQuestions(userId: string) {
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("grade_band").eq("id", userId).single();
  if (profileError || !["primary", "junior", "senior"].includes(profile?.grade_band)) {
    throw new Error("ไม่พบระดับคำถามของบัญชี กรุณาตรวจข้อมูลโปรไฟล์");
  }
  const ids = await fetchAllRows<{ id: number }>((from, to) => admin.from("questions")
    .select("id").eq("status", "active").eq("grade_band", profile.grade_band)
    .in("subject", ["math", "science"]).order("id").range(from, to));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  // Fetch a little more than the run needs so malformed questions can be
  // rejected without silently replacing them with unrelated sample questions.
  const chosen = ids.slice(0, 24).map(row => row.id);
  if (chosen.length < 3) throw new Error("คลังข้อสอบระดับนี้ยังมีคำถามไม่พอ");
  const { data, error } = await admin.from("questions")
    .select("id,question_text,choices,correct_index,image_url,explanation")
    .in("id", chosen).eq("status", "active").eq("grade_band", profile.grade_band);
  if (error) throw new Error("โหลดคำถามไม่สำเร็จ กรุณาลองใหม่");
  const byId = new Map((data as QuestionRow[] ?? []).map(q => [q.id, q]));
  const questions = chosen.map(id => byId.get(id)).filter((q): q is QuestionRow => !!q &&
    typeof q.question_text === "string" && !!q.question_text.trim() &&
    Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.every(c => typeof c === "string" && !!c.trim()) &&
    Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < q.choices.length)
    .slice(0, 12).map(q => [q.question_text, q.choices, q.correct_index, q.image_url, q.id, q.explanation]);
  if (questions.length < 3) throw new Error("คำถามที่พร้อมใช้ยังไม่พอ กรุณาลองใหม่");
  return { questions, gradeBand: profile.grade_band };
}
