"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
