"use client";

// จัดการ register/sync FCM push token ฝั่ง client
// ใช้ร่วมกันได้ทั้ง Android/iOS — Capacitor abstraction จัดการความต่างของ platform ให้แล้ว
// ห้ามขอ permission เองอัตโนมัติทุกครั้งที่เปิดแอป (ขัดกับหลักการ consent-first)
// - ถ้าเคย grant แล้ว: sync token เงียบๆ ทุกครั้งที่เปิดแอป (เผื่อ token หมุนใหม่)
// - ถ้ายังไม่เคยขอ (prompt): ไม่ทำอะไร รอ trigger ตามบริบท (เช่น หลัง hatch ตัวแรกสำเร็จ)
// - ถ้าเคยถูกปฏิเสธ (denied): ไม่ทำอะไร ให้ผู้ใช้ไปเปิดเองในตั้งค่าระบบ

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

type SavePushDeviceResult = { ok: boolean; error?: string };

async function savePushDevice(fcmToken: string): Promise<SavePushDeviceResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "no authenticated user" };

  const platform = Capacitor.getPlatform(); // "android" | "ios"
  if (platform !== "android" && platform !== "ios") {
    return { ok: false, error: `unsupported platform: ${platform}` };
  }

  const { error } = await supabase.from("push_devices").upsert(
    {
      user_id: user.id,
      fcm_token: fcmToken,
      platform,
      permission_status: "granted",
      enabled: true,
      app_version: null,
      last_seen_at: new Date().toISOString(),
      token_refreshed_at: new Date().toISOString(),
      invalidated_at: null,
    },
    { onConflict: "fcm_token" }
  );

  if (error) {
    console.error("[push] save token failed:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

function waitForRegistration(): Promise<string> {
  return new Promise((resolve, reject) => {
    const regListener = PushNotifications.addListener("registration", (token) => {
      regListener.then((l) => l.remove());
      errListener.then((l) => l.remove());
      resolve(token.value);
    });
    const errListener = PushNotifications.addListener("registrationError", (err) => {
      regListener.then((l) => l.remove());
      errListener.then((l) => l.remove());
      reject(err);
    });
    PushNotifications.register();
  });
}

/**
 * เรียกทุกครั้งที่แอปเปิด (native platform เท่านั้น) — sync token แบบเงียบๆ
 * ถ้า permission เคย granted อยู่แล้ว จะ register ใหม่ + save token ทุกครั้ง
 * (token อาจหมุนใหม่ได้เวลาลงแอปใหม่/ล้างข้อมูล จึงต้อง sync ซ้ำ ไม่ใช่ save ครั้งเดียวจบ)
 * ถ้ายังไม่เคยขอ หรือเคยถูกปฏิเสธ จะไม่ทำอะไรเลย ไม่ prompt ซ้ำ
 */
export async function syncPushTokenSilently(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const status = await PushNotifications.checkPermissions();
    if (status.receive !== "granted") return; // prompt หรือ denied -> ไม่ทำอะไร

    const token = await waitForRegistration();
    await savePushDevice(token);
  } catch (err) {
    console.error("[push] silent sync failed:", err);
  }
}

/**
 * เรียกเฉพาะจากจุดที่มี context ชัดเจน (เช่น หลัง hatch ตัวแรกสำเร็จ)
 * ถ้าผู้ใช้เคยตอบ (granted/denied) แล้ว จะไม่ prompt ซ้ำ — คืนสถานะเดิมกลับไปเฉยๆ
 */
export async function requestPushPermissionWithContext(): Promise<
  "granted" | "denied" | "already-asked" | "unsupported" | "error"
> {
  if (!Capacitor.isNativePlatform()) return "unsupported";

  try {
    const current = await PushNotifications.checkPermissions();
    if (current.receive === "granted") {
      const token = await waitForRegistration();
      await savePushDevice(token);
      return "already-asked";
    }
    if (current.receive === "denied") {
      return "already-asked";
    }

    // current.receive === "prompt" -> ถามจริงครั้งแรก
    const result = await PushNotifications.requestPermissions();
    if (result.receive === "granted") {
      const token = await waitForRegistration();
      await savePushDevice(token);
      return "granted";
    }
    return "denied";
  } catch (err) {
    console.error("[push] request permission failed:", err);
    return "error";
  }
}
