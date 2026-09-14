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
