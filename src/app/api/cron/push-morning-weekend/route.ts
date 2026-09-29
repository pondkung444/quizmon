import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/push/verifyCronRequest";
import { getEligibleRecipients } from "@/lib/push/eligibility";
import { dispatchNotifications } from "@/lib/push/dispatchNotifications";
import { buildDailyQuestMessage } from "@/lib/push/messageContent";
import { flushDeferredGuardianPushes } from "@/lib/push/guardianEventPush";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const admin = createAdminClient();
    const recipients = await getEligibleRecipients(admin, "daily_quest_enabled");
    const summary = await dispatchNotifications(
      admin,
      "daily_quest_morning_weekend",
      recipients,
      buildDailyQuestMessage
    );
    // ส่ง push ผู้พิทักษ์ที่ค้างจากช่วงพักกลางคืน — แยก try/catch ล้มแล้วต้องไม่กระทบ response เดิม
    let guardianDeferred: { sent: number; skipped: number } | { error: string };
    try {
      guardianDeferred = await flushDeferredGuardianPushes(admin);
    } catch (err) {
      console.error("[cron/push-morning-weekend] guardian flush failed:", err);
      guardianDeferred = { error: err instanceof Error ? err.message : "unknown error" };
    }
    return NextResponse.json({ ok: true, summary, guardianDeferred });
  } catch (err) {
    console.error("[cron/push-morning-weekend] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
