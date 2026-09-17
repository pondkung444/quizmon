import { createClient, getUser } from "@/lib/supabase/server";

// double-gate: RPC layer (is_guardian_admin ใน guardian_* ทุกตัว) เช็คอยู่แล้ว — ตัวนี้คือชั้น UI
// ที่ /guardian และ /guardian/link ต้องเช็คซ้ำก่อน render เสมอ ไม่พึ่ง RPC reject อย่างเดียว
export type GuardianAccess =
  | { status: "unauthenticated" }
  | { status: "not_enabled" }
  // allowlisted แล้วแต่ยังไม่มีแถว guardians — เคส Google OAuth สมัครใหม่ที่ handle_new_user()
  // ยังไม่รองรับ (ตั้ง account_type ผ่าน OAuth metadata ไม่ได้) นอกสโคปรอบนี้ ดู doc ที่แนบมา
  | { status: "no_guardian_row" }
  | { status: "ok"; userId: string; displayName: string | null };

export async function getGuardianAccess(): Promise<GuardianAccess> {
  const user = await getUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_guardian_admin", { p_user_id: user.id });
  if (!isAdmin) return { status: "not_enabled" };

  const { data: guardianRow } = await supabase
    .from("guardians")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!guardianRow) return { status: "no_guardian_row" };

  return { status: "ok", userId: user.id, displayName: guardianRow.display_name };
}

export type GuardianStudent = {
  student_id: string;
  username: string;
  grade_level: string | null;
  linked_at: string;
};

// เรียกที่ /guardian (list) และ layout.tsx ของ /guardian/[studentId] (ครอบทั้ง 3 หน้าย่อย) —
// ทั้งหมด กันแต่ละหน้า implement การเรียก guardian_get_students() ต่างกันเอง
//
// dedupe by student_id: guardian_links ไม่มี unique constraint กัน (guardian_id, student_id)
// ซ้ำ — ถ้ามีคน claim invite code คนละใบของนักเรียนคนเดียวกัน 2 ครั้ง RPC จะคืนแถวซ้ำ (เจอจริงกับ
// test data ตอน verify งานนี้: ซันซันมี 2 แถว claimed_at คนละเวลา) เก็บแถวแรกไว้พอ (RPC เรียงจาก
// claimed_at desc ให้แล้ว = ล่าสุดมาก่อน)
export async function getGuardianStudents(): Promise<GuardianStudent[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("guardian_get_students");
  const seen = new Set<string>();
  return (data ?? []).filter((s: GuardianStudent) => {
    if (seen.has(s.student_id)) return false;
    seen.add(s.student_id);
    return true;
  });
}
