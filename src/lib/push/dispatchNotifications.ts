import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToDevice } from "@/lib/push/sendPush";
import { getTodayInBangkok } from "@/lib/exp";
import type { EligibleRecipient } from "@/lib/push/eligibility";

type AdminClient = ReturnType<typeof createAdminClient>;

export type BuiltMessage = { title: string; body: string; deepLink?: string; imageUrl?: string };

const SEND_CONCURRENCY = 10;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type DispatchSummary = {
  notificationType: string;
  eligible: number;
  jobsCreated: number;
  skippedAlreadySentToday: number;
  devicesSent: number;
  devicesFailed: number;
};

/**
 * ยิง push ให้ recipients ทั้งชุด สำหรับ notificationType เดียว
 * idempotency กันยิงซ้ำวันเดียวกัน (unique(idempotency_key) ที่ DB) — ถ้า insert ไม่ผ่านเพราะ
 * conflict แปลว่ายิงไปแล้วรอบก่อนหน้า (เช่น cron ถูกเรียกซ้ำ) จะ skip ทันทีไม่ยิงซ้ำ
 */
export async function dispatchNotifications(
  admin: AdminClient,
  notificationType: string,
  recipients: EligibleRecipient[],
  buildMessage: (recipient: EligibleRecipient) => BuiltMessage | null
): Promise<DispatchSummary> {
  const today = getTodayInBangkok();
  const summary: DispatchSummary = {
    notificationType,
    eligible: recipients.length,
    jobsCreated: 0,
    skippedAlreadySentToday: 0,
    devicesSent: 0,
    devicesFailed: 0,
  };

  const jobRows: { recipient: EligibleRecipient; message: BuiltMessage; idempotencyKey: string }[] = [];
  for (const recipient of recipients) {
    const message = buildMessage(recipient);
    if (!message) continue;
    jobRows.push({
      recipient,
      message,
      idempotencyKey: `${recipient.userId}:${notificationType}:${today}`,
    });
  }
  if (jobRows.length === 0) return summary;

  // insert แบบ ignoreDuplicates -> รู้ได้จาก response ว่าอันไหน insert จริง (ไม่ conflict)
  const { data: insertedJobs, error: insertError } = await admin
    .from("notification_jobs")
    .upsert(
      jobRows.map((r) => ({
        user_id: r.recipient.userId,
        notification_type: notificationType,
        title: r.message.title,
        body: r.message.body,
        deep_link: r.message.deepLink ?? null,
        image_url: r.message.imageUrl ?? null,
        idempotency_key: r.idempotencyKey,
        status: "pending",
      })),
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    )
    .select("id, idempotency_key");
  if (insertError) throw insertError;

  const insertedKeys = new Set((insertedJobs ?? []).map((j) => j.idempotency_key as string));
  summary.jobsCreated = insertedKeys.size;
  summary.skippedAlreadySentToday = jobRows.length - insertedKeys.size;

  const jobIdByKey = new Map((insertedJobs ?? []).map((j) => [j.idempotency_key as string, j.id as string]));

  const toSend = jobRows.filter((r) => insertedKeys.has(r.idempotencyKey));

  for (const batch of chunk(toSend, SEND_CONCURRENCY)) {
    await Promise.all(
      batch.map(async ({ recipient, idempotencyKey }) => {
        const jobId = jobIdByKey.get(idempotencyKey)!;
        let anySuccess = false;
        let lastError: string | null = null;

        for (const device of recipient.devices) {
          try {
            const result = await sendPushToDevice({
              token: device.token,
              title: jobRows.find((r) => r.idempotencyKey === idempotencyKey)!.message.title,
              body: jobRows.find((r) => r.idempotencyKey === idempotencyKey)!.message.body,
              deepLink: jobRows.find((r) => r.idempotencyKey === idempotencyKey)!.message.deepLink,
              imageUrl: jobRows.find((r) => r.idempotencyKey === idempotencyKey)!.message.imageUrl,
            });

            if (result.ok) {
              anySuccess = true;
              summary.devicesSent += 1;
              await admin.from("notification_deliveries").insert({
                notification_job_id: jobId,
                push_device_id: device.deviceId,
                status: "success",
                provider_message_id: result.providerMessageId,
              });
            } else {
              summary.devicesFailed += 1;
              lastError = result.errorCode;
              await admin.from("notification_deliveries").insert({
                notification_job_id: jobId,
                push_device_id: device.deviceId,
                status: "failed",
                error_code: result.errorCode,
              });
              if (result.shouldInvalidateToken) {
                await admin
                  .from("push_devices")
                  .update({ enabled: false, invalidated_at: new Date().toISOString() })
                  .eq("id", device.deviceId);
              }
            }
          } catch (err) {
            summary.devicesFailed += 1;
            lastError = err instanceof Error ? err.message : "unknown error";
          }
        }

        await admin
          .from("notification_jobs")
          .update({
            status: anySuccess ? "sent" : "failed",
            sent_at: anySuccess ? new Date().toISOString() : null,
            last_error: lastError,
            attempt_count: recipient.devices.length,
          })
          .eq("id", jobId);
      })
    );
  }

  return summary;
}
