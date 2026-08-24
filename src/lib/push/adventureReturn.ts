import { createAdminClient } from "@/lib/supabase/admin";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";
import { sendPushToDevice } from "@/lib/push/sendPush";

type AdminClient = ReturnType<typeof createAdminClient>;

type EggTypeJoin = { sprite_prefix: string; name_th: string };
type PetJoin = {
  nickname: string | null;
  subline: string | null;
  personality: string | null;
  egg_types: EggTypeJoin | EggTypeJoin[] | null;
};
type RunRow = {
  id: string;
  user_id: string;
  pets: PetJoin | PetJoin[] | null;
};

function pickOne<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ชุดข้อความตาม QuizMon-Push-Notification-Design.md §11 "ชุดข้อความ — กลับจากผจญภัย"
// {name} = nickname ที่ผู้เล่นตั้ง ถ้าไม่มีใช้ชื่อสายพันธุ์แทน (ตาม §2.2 fallback rule)
const MESSAGE_VARIANTS: { title: string; body: string }[] = [
  { title: "{name} กลับมาแล้ว! 🧭", body: "การเดินทางในถ้ำเยือกขาวเสร็จสิ้น มาดูกันว่าเราเจออะไรมาบ้าง" },
  { title: "การผจญภัยเสร็จสิ้นแล้ว ❄️", body: "{name} เดินทางกลับถึงฟาร์มพร้อมของที่ค้นพบ" },
  { title: "{name} มีของกลับมาฝาก! ✨", body: "การเดินทางครั้งนี้จบลงแล้ว เข้าไปดูสิว่าเราได้อะไรมาบ้าง" },
];

export type AdventureReturnSummary = {
  candidates: number;
  jobsCreated: number;
  skippedAlreadySent: number;
  devicesSent: number;
  devicesFailed: number;
};

/**
 * ส่ง push "Qmon กลับจากผจญภัย" ให้ทุก run ที่จบแล้ว (ends_at ผ่านแล้ว) แต่ยังไม่เคลม
 * (claimed_at is null) — ปลอดภัยที่จะเรียกซ้ำถี่ๆ จาก cron ได้เสมอ เพราะ idempotency_key
 * ผูกกับ run.id ตรงๆ (ไม่ใช่วันที่แบบ scheduled push) ทำให้ run เดียวกันถูกส่งแค่ครั้งเดียว
 * แม้ cron จะยิงมาเจอ run เดิมซ้ำหลายรอบก่อนผู้เล่นจะเคลม
 */
export async function sendAdventureReturnPushes(admin: AdminClient): Promise<AdventureReturnSummary> {
  const summary: AdventureReturnSummary = {
    candidates: 0,
    jobsCreated: 0,
    skippedAlreadySent: 0,
    devicesSent: 0,
    devicesFailed: 0,
  };

  const { data: runs, error: runsError } = await admin
    .from("dungeon_runs")
    .select("id, user_id, pets(nickname, subline, personality, egg_types(sprite_prefix, name_th))")
    .eq("status", "in_progress")
    .is("claimed_at", null)
    .lte("ends_at", new Date().toISOString());
  if (runsError) throw runsError;
  if (!runs || runs.length === 0) return summary;

  const typedRuns = runs as unknown as RunRow[];
  summary.candidates = typedRuns.length;

  const userIds = Array.from(new Set(typedRuns.map((r) => r.user_id)));

  const { data: prefs, error: prefsError } = await admin
    .from("push_preferences")
    .select("user_id")
    .eq("push_enabled", true)
    .eq("adventure_enabled", true)
    .in("user_id", userIds);
  if (prefsError) throw prefsError;
  const eligibleUserIds = new Set((prefs ?? []).map((p) => p.user_id as string));
  if (eligibleUserIds.size === 0) return summary;

  const { data: devices, error: devicesError } = await admin
    .from("push_devices")
    .select("id, user_id, fcm_token")
    .eq("enabled", true)
    .in("user_id", Array.from(eligibleUserIds));
  if (devicesError) throw devicesError;

  const deviceMap = new Map<string, { deviceId: string; token: string }[]>();
  for (const d of devices ?? []) {
    const list = deviceMap.get(d.user_id as string) ?? [];
    list.push({ deviceId: d.id as string, token: d.fcm_token as string });
    deviceMap.set(d.user_id as string, list);
  }

  for (const run of typedRuns) {
    if (!eligibleUserIds.has(run.user_id)) continue;
    const userDevices = deviceMap.get(run.user_id);
    if (!userDevices || userDevices.length === 0) continue;

    const petRow = pickOne(run.pets);
    if (!petRow) continue;
    const eggType = pickOne(petRow.egg_types);
    if (!eggType || !petRow.subline || !petRow.personality) continue;

    const petImagePath = getPetImagePath(
      eggType.sprite_prefix,
      4,
      petRow.subline as Subline,
      petRow.personality as Personality
    );
    const speciesName = getSpeciesName(
      eggType.sprite_prefix,
      4,
      petRow.subline as Subline,
      petRow.personality as Personality,
      eggType.name_th
    );
    const displayName = petRow.nickname || speciesName;

    const variant = MESSAGE_VARIANTS[Math.floor(Math.random() * MESSAGE_VARIANTS.length)];
    const title = variant.title.replace("{name}", displayName);
    const body = variant.body.replace("{name}", displayName);
    const imageUrl = `https://quizmon.xyz${petImagePath}`;
    const idempotencyKey = `${run.user_id}:adventure_returned:${run.id}`;

    const { data: inserted, error: insertError } = await admin
      .from("notification_jobs")
      .upsert(
        {
          user_id: run.user_id,
          notification_type: "adventure_returned",
          title,
          body,
          deep_link: "/pet",
          image_url: imageUrl,
          idempotency_key: idempotencyKey,
          status: "pending",
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    if (insertError) throw insertError;
    if (!inserted) {
      summary.skippedAlreadySent += 1;
      continue; // ส่งไปแล้วรอบก่อนหน้า (idempotent — กัน cron ยิงซ้ำแล้วส่งซ้ำ)
    }

    summary.jobsCreated += 1;
    let anySuccess = false;
    let lastError: string | null = null;

    for (const device of userDevices) {
      try {
        const result = await sendPushToDevice({
          token: device.token,
          title,
          body,
          deepLink: "/pet",
          imageUrl,
        });
        if (result.ok) {
          anySuccess = true;
          summary.devicesSent += 1;
          await admin.from("notification_deliveries").insert({
            notification_job_id: inserted.id,
            push_device_id: device.deviceId,
            status: "success",
            provider_message_id: result.providerMessageId,
          });
        } else {
          summary.devicesFailed += 1;
          lastError = result.errorCode;
          await admin.from("notification_deliveries").insert({
            notification_job_id: inserted.id,
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
        attempt_count: userDevices.length,
      })
      .eq("id", inserted.id);
  }

  return summary;
}
