import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToDevice } from "@/lib/push/sendPush";
import { isWithinQuietHours } from "@/lib/push/quietHours";
import { getShowcasePetImageUrl } from "@/lib/push/showcasePet";

type AdminClient = ReturnType<typeof createAdminClient>;

export type SocialEventType =
  | "encouragement_received"
  | "friend_request_received"
  | "friend_request_accepted";

// ชุดข้อความตาม QuizMon-Push-Notification-Design.md §11 — {name} = ชื่อในเกมของผู้พูด
// แต่ละกลุ่มหมุนเวียนแบบสุ่ม (ไม่ tracking ว่าใช้อันไหนไปแล้วเพื่อความง่าย — เพราะ event
// เหล่านี้ยิงครั้งเดียวต่อ action ไม่ใช่ทุกวันแบบ scheduled push จึงไม่ค่อยเจอข้อความซ้ำติดกัน
// ในทางปฏิบัติ ต่างจาก "กลับจากผจญภัย" ที่อาจเกิดถี่กว่า)
const MESSAGE_VARIANTS: Record<SocialEventType, { title: string; body: string }[]> = {
  encouragement_received: [
    { title: "{name} ส่งกำลังใจมาให้ ✨", body: "มีข้อความดีๆ รอเธออยู่ใน QuizMon" },
    { title: "กำลังใจจาก {name} มาถึงแล้ว 💛", body: "เข้าไปเปิดอ่านข้อความที่เพื่อนส่งมาให้กันนะ" },
    { title: "วันนี้มีคนส่งกำลังใจให้เธอ", body: "{name} ฝากข้อความดีๆ ไว้ให้ในหน้าสังคม" },
  ],
  friend_request_received: [
    { title: "มีคนอยากเป็นเพื่อนกับเธอ 👋", body: "{name} ส่งคำขอเป็นเพื่อนมาให้" },
    { title: "คำขอเป็นเพื่อนใหม่มาถึงแล้ว", body: "{name} อยากเพิ่มเธอเป็นเพื่อนใน QuizMon" },
    { title: "{name} อยากร่วมเดินทางกับเธอ ✨", body: "เข้าไปดู Qmon และตอบรับคำขอเป็นเพื่อนได้เลย" },
  ],
  friend_request_accepted: [
    { title: "เธอกับ {name} เป็นเพื่อนกันแล้ว! 🎉", body: "ไปดู Qmon และส่งกำลังใจให้เพื่อนใหม่กันได้เลย" },
    { title: "ได้เพื่อนใหม่แล้ว ✨", body: "{name} ตอบรับคำขอของเธอแล้ว ไปทักทายกันนะ" },
    { title: "{name} เข้าร่วมกลุ่มเพื่อนแล้ว", body: "ตอนนี้เธอสามารถดูโปรไฟล์และส่งกำลังใจให้กันได้แล้ว" },
  ],
};

export type SendSocialEventPushParams = {
  recipientUserId: string;
  /** userId ของคนที่ "พูด" ใน push (ผู้ส่งกำลังใจ/ผู้ส่งคำขอ/คนที่เพิ่งตอบรับ) — ใช้ทั้งดึงชื่อ
   * และดึงภาพ Qmon ที่ภูมิใจมาแสดง (ตาม design doc §11 คอลัมน์ "ผู้พูด") */
  actorUserId: string;
  actorUsername: string;
  eventType: SocialEventType;
  deepLink: string;
  /** กันส่งซ้ำถ้า server action ถูกเรียกซ้ำ (เช่น double-submit) — ไม่ต้อง unique ข้ามเวลาแบบ
   * adventure return เพราะ action นี้ทำได้ครั้งเดียวต่อ request/encouragement id อยู่แล้ว */
  idempotencyKey: string;
};

export type SendSocialEventPushResult = { sent: boolean; reason?: string };

/**
 * ส่ง event push ให้ผู้รับหนึ่งคน — เรียกจาก server action โดยตรงทันทีที่ action สำเร็จ
 * (ไม่ผ่าน cron เหมือน adventure return เพราะเป็น action-triggered event แท้ๆ ไม่มีปัญหา
 * Vercel Hobby cron frequency limit เข้ามาเกี่ยวข้องเลย)
 *
 * ทั้ง 3 event ผูก preference คอลัมน์เดียวกันคือ social_enabled (toggle รวมตาม settings
 * 5 หมวดที่ design doc ล็อกไว้ — "เพื่อนและกำลังใจ" เป็น toggle เดียว ไม่แยกย่อย)
 *
 * ไม่ throw error ออกไปนอกฟังก์ชันนี้เลย — push ส่งไม่สำเร็จต้องไม่ทำให้ action หลัก
 * (ส่งกำลังใจ/ตอบรับเพื่อน) ล้มเหลวตามไปด้วย
 */
export async function sendSocialEventPush(
  params: SendSocialEventPushParams
): Promise<SendSocialEventPushResult> {
  try {
    if (isWithinQuietHours()) {
      return { sent: false, reason: "quiet_hours" };
    }

    const admin = createAdminClient();

    const { data: pref } = await admin
      .from("push_preferences")
      .select("push_enabled, social_enabled")
      .eq("user_id", params.recipientUserId)
      .maybeSingle();
    if (!pref?.push_enabled || !pref?.social_enabled) {
      return { sent: false, reason: "preference_disabled" };
    }

    const { data: devices } = await admin
      .from("push_devices")
      .select("id, fcm_token")
      .eq("user_id", params.recipientUserId)
      .eq("enabled", true);
    if (!devices || devices.length === 0) {
      return { sent: false, reason: "no_devices" };
    }

    const variants = MESSAGE_VARIANTS[params.eventType];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const title = variant.title.replace("{name}", params.actorUsername);
    const body = variant.body.replace("{name}", params.actorUsername);
    const imageUrl = await getShowcasePetImageUrl(admin, params.actorUserId);

    const { data: inserted, error: insertError } = await admin
      .from("notification_jobs")
      .upsert(
        {
          user_id: params.recipientUserId,
          notification_type: params.eventType,
          title,
          body,
          deep_link: params.deepLink,
          image_url: imageUrl,
          idempotency_key: params.idempotencyKey,
          status: "pending",
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    if (insertError) return { sent: false, reason: insertError.message };
    if (!inserted) return { sent: false, reason: "duplicate" }; // ยิงซ้ำ (idempotent)

    let anySuccess = false;
    let lastError: string | null = null;

    for (const device of devices) {
      try {
        const result = await sendPushToDevice({
          token: device.fcm_token,
          title,
          body,
          deepLink: params.deepLink,
          imageUrl: imageUrl ?? undefined,
        });
        if (result.ok) {
          anySuccess = true;
          await admin.from("notification_deliveries").insert({
            notification_job_id: inserted.id,
            push_device_id: device.id,
            status: "success",
            provider_message_id: result.providerMessageId,
          });
        } else {
          lastError = result.errorCode;
          await admin.from("notification_deliveries").insert({
            notification_job_id: inserted.id,
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
      .eq("id", inserted.id);

    return { sent: anySuccess };
  } catch (err) {
    // push ล้มเหลวต้องไม่ทำให้ action หลัก (ส่งกำลังใจ/ตอบรับเพื่อน) พังตาม
    console.error(`[push] sendSocialEventPush(${params.eventType}) failed:`, err);
    return { sent: false, reason: err instanceof Error ? err.message : "unknown error" };
  }
}
