"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PushNotifications, type ActionPerformed } from "@capacitor/push-notifications";
import { syncPushTokenSilently } from "@/lib/push/pushClient";

// จัดการปุ่ม back ของ Android (ระบบปิดแอปทันทีถ้าไม่ handle เอง แทนที่จะ navigate กลับในแอป)
export default function NativeAppSetup() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  // sync push token เงียบๆ ทุกครั้งที่เปิดแอป (เฉพาะถ้าเคย grant permission แล้วเท่านั้น)
  // การขอ permission จริงครั้งแรก (prompt) ไม่ทำที่นี่ — ย้ายไปเรียกแบบมี context
  // จากจุดที่เหมาะสม เช่น หลัง hatch ตัวแรกสำเร็จ (ดู EggsClient.tsx)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    syncPushTokenSilently();
  }, []);

  // เปิดหน้าตามปลายทางที่กำหนดตอนแตะ push notification — payload มี data.deep_link
  // ส่งมาตั้งแต่ sendPush.ts อยู่แล้วทุก event/scheduled push ที่มี deepLink แต่ยังไม่เคยมี
  // ใครอ่านค่านี้ฝั่ง native เลยจนถึงตอนนี้
  //
  // ครอบคลุมทั้ง 2 เคส: แอปเปิดอยู่แล้วตอนแตะ (foreground/background) และแอปถูกเปิดขึ้นมาใหม่
  // จาก notification (cold start) — Capacitor คิว event ไว้เองจนกว่า listener จะพร้อมรับ
  // สำหรับเคส cold start ไม่ต้อง handle แยก
  //
  // router.push() เฉยๆ พอ — ห้ามคู่กับ router.refresh() (Next.js 16.2.10 canary มีบั๊ก UI hang
  // ถ้าเรียกคู่กัน ตามที่เคยเจอมาก่อนหน้านี้ในโปรเจกต์)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        const deepLink = action.notification.data?.deep_link;
        // เช็ค startsWith("/") กันไว้ — ต้องเป็น path ภายในแอปเท่านั้น ไม่ navigate ไปที่ไหน
        // ก็ได้ตาม data ที่แนบมา (แม้ FCM data payload จะคุมจากฝั่ง server เราอยู่แล้วก็ตาม)
        if (typeof deepLink === "string" && deepLink.startsWith("/")) {
          router.push(deepLink);
        }
      }
    );

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [router]);

  return null;
}
