"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { APP_THEME_COOKIE, parseAppTheme } from "@/lib/appTheme";

export type PushPreferencesUpdate = Partial<{
  push_enabled: boolean;
  daily_quest_enabled: boolean;
  daily_exp_enabled: boolean;
  adventure_enabled: boolean;
  social_enabled: boolean;
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
