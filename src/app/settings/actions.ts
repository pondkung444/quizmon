"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGradeProfile } from "@/lib/gradeBand";
import { gradeChangeKind } from "@/lib/gradeLevel";
import { APP_THEME_COOKIE, parseAppTheme } from "@/lib/appTheme";

export type PushPreferencesUpdate = Partial<{
  push_enabled: boolean;
  daily_quest_enabled: boolean;
  daily_exp_enabled: boolean;
  adventure_enabled: boolean;
  social_enabled: boolean;
  guardian_enabled: boolean;
}>;

export async function updatePushPreferences(update: PushPreferencesUpdate) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const { error } = await supabase.from("push_preferences").update(update).eq("user_id", user.id);
  if (error) throw new Error("บันทึกการตั้งค่าไม่สำเร็จ: " + error.message);

  revalidatePath("/settings");
}

// ย้ายข้ามกลุ่ม (ม.ต้น <-> ม.ปลาย) เปลี่ยน profiles.grade_band ซึ่งกระทบกระดานอันดับรายสัปดาห์
// (weekly_scores_bkk อ่าน band ปัจจุบัน ไม่ใช่ตอนที่ตอบ) จึงจำกัดไม่ให้ย้ายถี่ กันสลับกระดานแย่งรางวัล
const BAND_CHANGE_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type UpdateGradeLevelResult =
  | { ok: true; gradeLevel: string; bandChanged: boolean }
  | { ok: false; reason: "invalid" | "needs_confirm" | "cooldown" | "error"; retryAfterDays?: number };

// เปลี่ยนระดับชั้นของตัวเอง — server เป็น source of truth: ตรวจค่า, เช็คข้ามกลุ่ม/cooldown เอง ไม่เชื่อ client
// ย้ายภายในกลุ่มเดียวกัน (ม.1-3 หรือ ม.4-6) เปลี่ยนได้อิสระ; ข้ามกลุ่มต้อง confirmBandChange=true และไม่เกินรอบ cooldown
// cooldown เก็บผ่าน analytics_events (event 'grade_level_changed', props.band_changed=true) ไม่เพิ่มคอลัมน์ใหม่
// ใน profiles — อ่านด้วย admin client เพราะตารางนี้ไม่มี select policy ให้ผู้เล่น (ดู migration 014)
export async function updateGradeLevel(input: {
  gradeLevel: string;
  confirmBandChange?: boolean;
}): Promise<UpdateGradeLevelResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const current = await getGradeProfile(user.id);
  const kind = gradeChangeKind(current.gradeLevel, current.band, input.gradeLevel);
  if (kind === "invalid") return { ok: false, reason: "invalid" };
  const next = input.gradeLevel;
  if (kind === "same") return { ok: true, gradeLevel: next, bandChanged: false };

  const bandChanged = kind === "cross_band";
  const admin = createAdminClient();

  if (bandChanged) {
    if (!input.confirmBandChange) return { ok: false, reason: "needs_confirm" };

    const { data: lastChange } = await admin
      .from("analytics_events")
      .select("client_ts")
      .eq("user_id", user.id)
      .eq("event_name", "grade_level_changed")
      .contains("props", { band_changed: true })
      .order("client_ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastChange) {
      const elapsedMs = Date.now() - new Date(lastChange.client_ts).getTime();
      const remainingMs = BAND_CHANGE_COOLDOWN_DAYS * DAY_MS - elapsedMs;
      if (remainingMs > 0) {
        return { ok: false, reason: "cooldown", retryAfterDays: Math.ceil(remainingMs / DAY_MS) };
      }
    }
  }

  // update ผ่าน user client (RLS "เจ้าของแก้โปรไฟล์ตัวเองได้" — complete-profile ใช้ทางเดียวกัน) แล้ว select กลับ
  // ยืนยันว่าแถวถูกแก้จริง: RLS ที่ไม่อนุญาตจะไม่ error แต่คืน 0 แถวเงียบๆ
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ grade_level: next })
    .eq("id", user.id)
    .select("grade_level")
    .maybeSingle();
  if (error || !updated) return { ok: false, reason: "error" };

  // log ไว้ทั้งเพื่อ cooldown และไว้ตรวจย้อนหลัง — พลาดก็ไม่ย้อนกลับการเปลี่ยนชั้น (best-effort)
  await admin.from("analytics_events").insert({
    user_id: user.id,
    session_id: crypto.randomUUID(),
    event_name: "grade_level_changed",
    screen: "/settings",
    props: { from: current.gradeLevel, to: next, band_changed: bandChanged },
    client_ts: new Date().toISOString(),
  });

  // ชั้น/กลุ่มมีผลกับหลายหน้า (โหมดฝึก, ภารกิจ, อันดับ, เพื่อน) — ล้าง cache ทั้งแอปแทนการไล่ทีละ path
  revalidatePath("/", "layout");
  return { ok: true, gradeLevel: next, bandChanged };
}

// ลบบัญชี+ข้อมูลทั้งหมดถาวร (ตาม Google Play account deletion requirement) — RPC ฝั่ง DB
// (delete_own_account, security definer) ใช้ auth.uid() เป็นตัวกำหนดเสมอ ไม่รับ user id จาก client
// จึงลบได้แค่บัญชีตัวเองเท่านั้น ไม่มี grace period ลบแล้วกู้คืนไม่ได้
export async function deleteOwnAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw new Error("ลบบัญชีไม่สำเร็จ: " + error.message);

  await supabase.auth.signOut();
}

// ธีมแอป — เก็บใน cookie (ไม่ใช่ DB) ดูเหตุผลใน src/lib/appTheme.ts
// parseAppTheme กันค่าแปลกจาก client ตกไปเป็นค่าเริ่มต้นเสมอ
export async function setAppTheme(theme: string) {
  (await cookies()).set(APP_THEME_COOKIE, parseAppTheme(theme), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  for (const path of ["/pet", "/social", "/collection", "/pvp", "/quiz", "/settings", "/achievements", "/hall-of-fame", "/eggs", "/my-plan"]) revalidatePath(path, "layout");
}
