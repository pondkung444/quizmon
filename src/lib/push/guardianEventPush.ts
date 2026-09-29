import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToDevice } from "@/lib/push/sendPush";
import { isWithinQuietHours } from "@/lib/push/quietHours";
import { getTodayInBangkok } from "@/lib/exp";

type AdminClient = ReturnType<typeof createAdminClient>;

const NOTIFICATION_TYPE = "guardian_goal_set";
const DEEP_LINK = "/social?tab=profile";
const DEFERRED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ข้อความคงที่ — ใช้คำกลาง "ผู้พิทักษ์" เสมอ ไม่มีชื่อ ไม่มีตัวเลข และไม่ดึงข้อความที่ผู้ปกครองพิมพ์
// (Q6: ห้ามใส่ guardians.display_name หรือข้อความใดๆ ของผู้ปกครองลง push)
const TITLE = "ผู้พิทักษ์ตั้งเป้าให้สัปดาห์นี้แล้ว 🎯";
const BODY = "แวะดูเป้าและรางวัลได้ในหน้าสังคม";

type DeviceRow = { id: string; fcm_token: string };

/**
 * ส่ง push ให้ทุก device แล้วบันทึก deliveries + invalidate token ที่ใช้ไม่ได้ — คืนผลรวมของ job
 * (ตรรกะเดียวกับ sendSocialEventPush / dispatchNotifications)
 */
async function deliver(
  admin: AdminClient,
  jobId: string,
  devices: DeviceRow[]
): Promise<{ anySuccess: boolean; lastError: string | null }> {
  let anySuccess = false;
  let lastError: string | null = null;

  for (const device of devices) {
    try {
      const result = await sendPushToDevice({
        token: device.fcm_token,
        title: TITLE,
        body: BODY,
        deepLink: DEEP_LINK,
      });
      if (result.ok) {
        anySuccess = true;
        await admin.from("notification_deliveries").insert({
          notification_job_id: jobId,
          push_device_id: device.id,
          status: "success",
          provider_message_id: result.providerMessageId,
        });
      } else {
        lastError = result.errorCode;
        await admin.from("notification_deliveries").insert({
          notification_job_id: jobId,
          push_device_id: device.id,
          status: "failed",
          error_code: result.errorCode,
        });
        if (result.shouldInvalidateToken) {
          await admin
            .from("push_devices")
            .update({ enabled: false, invalidated_at: new Date().toISOString() })
            .eq("id", device.id);
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown error";
    }
  }

  await admin
    .from("notification_jobs")
    .update({
      status: anySuccess ? "sent" : "failed",
      sent_at: anySuccess ? new Date().toISOString() : null,
      last_error: lastError,
      attempt_count: devices.length,
    })
    .eq("id", jobId);

  return { anySuccess, lastError };
}

/**
 * แจ้งเด็กว่าผู้พิทักษ์ตั้งเป้าให้ — เรียกจาก server action หลัง guardian_set_goal สำเร็จ
 *
 * - idempotency ต่อเด็กต่อวัน (เวลาไทย): ผู้ปกครองเปลี่ยนระดับหลายรอบในวันเดียวได้ push ครั้งเดียว
 * - อยู่ในช่วงพักกลางคืน → เก็บเป็น job `pending` แล้ว cron เช้ารอบแรกส่งให้ (Q10: ไม่ทิ้ง)
 * - ไม่ throw ออกนอกฟังก์ชัน — push พังต้องไม่ทำให้การตั้งเป้าล้ม
 */
export async function sendGuardianGoalSetPush(
  studentId: string
): Promise<{ sent: boolean; deferred?: boolean; reason?: string }> {
  try {
    const admin = createAdminClient();

    const { data: pref } = await admin
      .from("push_preferences")
      .select("push_enabled, guardian_enabled")
      .eq("user_id", studentId)
      .maybeSingle();
    if (!pref?.push_enabled || !pref?.guardian_enabled) {
      return { sent: false, reason: "preference_disabled" };
    }

    const { data: devices } = await admin
      .from("push_devices")
      .select("id, fcm_token")
      .eq("user_id", studentId)
      .eq("enabled", true);
    if (!devices || devices.length === 0) {
      return { sent: false, reason: "no_devices" };
    }

    const quiet = isWithinQuietHours();

    const { data: inserted, error: insertError } = await admin
      .from("notification_jobs")
      .upsert(
        {
          user_id: studentId,
          notification_type: NOTIFICATION_TYPE,
          title: TITLE,
          body: BODY,
          deep_link: DEEP_LINK,
          idempotency_key: `${NOTIFICATION_TYPE}:${studentId}:${getTodayInBangkok()}`,
          status: "pending",
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    if (insertError) return { sent: false, reason: insertError.message };
    if (!inserted) return { sent: false, reason: "duplicate" }; // วันนี้แจ้งไปแล้ว/รอส่งอยู่แล้ว

    if (quiet) return { sent: false, deferred: true };

    const { anySuccess } = await deliver(admin, inserted.id as string, devices as DeviceRow[]);
    return { sent: anySuccess };
  } catch (err) {
    console.error("[push] sendGuardianGoalSetPush failed:", err);
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" };
  }
}

/**
 * cron เช้า: ส่ง job guardian_goal_set ที่ค้าง pending เพราะตั้งเป้าตอนช่วงพัก
 * - เกิน 24 ชม. → skipped (expired)
 * - เช็ค preference + ลิงก์ผู้พิทักษ์ ณ ตอนส่งจริง ไม่ผ่าน → skipped
 * ไม่ throw — คืน summary เสมอ
 */
export async function flushDeferredGuardianPushes(
  admin: AdminClient
): Promise<{ sent: number; skipped: number }> {
  const summary = { sent: 0, skipped: 0 };
  try {
    const { data: jobs, error } = await admin
      .from("notification_jobs")
      .select("id, user_id, created_at")
      .eq("notification_type", NOTIFICATION_TYPE)
      .eq("status", "pending");
    if (error) throw error;

    const skip = async (jobId: string, reason: string) => {
      summary.skipped += 1;
      await admin.from("notification_jobs").update({ status: "skipped", last_error: reason }).eq("id", jobId);
    };

    for (const job of jobs ?? []) {
      try {
        const jobId = job.id as string;
        const userId = job.user_id as string;

        if (Date.now() - new Date(job.created_at as string).getTime() > DEFERRED_MAX_AGE_MS) {
          await skip(jobId, "expired");
          continue;
        }

        const { data: pref } = await admin
          .from("push_preferences")
          .select("push_enabled, guardian_enabled")
          .eq("user_id", userId)
          .maybeSingle();
        if (!pref?.push_enabled || !pref?.guardian_enabled) {
          await skip(jobId, "preference_disabled");
          continue;
        }

        const { data: link } = await admin
          .from("guardian_links")
          .select("id")
          .eq("student_id", userId)
          .eq("status", "claimed")
          .limit(1)
          .maybeSingle();
        if (!link) {
          await skip(jobId, "link_revoked");
          continue;
        }

        const { data: devices } = await admin
          .from("push_devices")
          .select("id, fcm_token")
          .eq("user_id", userId)
          .eq("enabled", true);
        if (!devices || devices.length === 0) {
          await skip(jobId, "no_devices");
          continue;
        }

        const { anySuccess } = await deliver(admin, jobId, devices as DeviceRow[]);
        if (anySuccess) summary.sent += 1;
      } catch (err) {
        console.error("[push] flushDeferredGuardianPushes job failed:", err);
      }
    }
  } catch (err) {
    console.error("[push] flushDeferredGuardianPushes failed:", err);
  }
  return summary;
}
