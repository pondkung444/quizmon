import {safeDispatchFarmAttention} from "@/lib/push/farmAttention";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/push/verifyCronRequest";
import { getEligibleRecipients } from "@/lib/push/eligibility";
import { dispatchNotifications } from "@/lib/push/dispatchNotifications";
import { buildDailyExpMessage } from "@/lib/push/messageContent";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const admin = createAdminClient();
    const recipients = await getEligibleRecipients(admin, "daily_exp_enabled");
    const summary = await dispatchNotifications(admin, "daily_exp_evening", recipients, buildDailyExpMessage);
    const farm = await safeDispatchFarmAttention(admin);
    return NextResponse.json({ ok: true, farm, summary });
  } catch (err) {
    console.error("[cron/push-evening] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
