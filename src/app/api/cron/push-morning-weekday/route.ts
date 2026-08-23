import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/push/verifyCronRequest";
import { getEligibleRecipients } from "@/lib/push/eligibility";
import { dispatchNotifications } from "@/lib/push/dispatchNotifications";
import { buildDailyQuestMessage } from "@/lib/push/messageContent";

export const maxDuration = 60; // เพดานสูงสุดที่ตั้งได้บน Vercel Hobby

export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const admin = createAdminClient();
    const recipients = await getEligibleRecipients(admin, "daily_quest_enabled");
    const summary = await dispatchNotifications(
      admin,
      "daily_quest_morning_weekday",
      recipients,
      buildDailyQuestMessage
    );
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[cron/push-morning-weekday] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
