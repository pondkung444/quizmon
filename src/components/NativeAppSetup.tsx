"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { PushNotifications, type ActionPerformed } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";
import { syncPushTokenSilently } from "@/lib/push/pushClient";
import {
  NATIVE_OAUTH_CALLBACK_URL,
  NATIVE_OAUTH_ERROR_EVENT,
  takeNativeOAuthFlow,
} from "@/lib/nativeOAuth";

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

  // รับ deep link callback ที่ system browser ส่งกลับเข้าแอปหลัง Google consent สำเร็จ
  // (com.quizmon.app://login-callback?code=...) — อยู่ที่นี่ (mount ทุกหน้า) ไม่ใช่เฉพาะ /login
  // เพราะ guest ผูกไอดี (GuestUpgradeGate) เริ่ม flow จากหน้าอื่น ถ้า listener ไม่ได้ mount อยู่
  // ผู้ใช้จะค้างอยู่ใน browser แล้วไม่กลับเข้าเกม
  //   login: exchange code -> SIGNED_IN -> listener ใน /login redirect ต่อเอง
  //   link:  exchange code (เชื่อม identity เข้า user เดิม) -> hard navigate ไป /pet ให้ layout อ่าน
  //          สถานะ is_anonymous ใหม่ (ไม่ใช้ router.refresh — ดูหมายเหตุบั๊ก UI hang ด้านล่าง)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const supabase = createClient();
    const listenerPromise = App.addListener("appUrlOpen", async (event: URLOpenListenerEvent) => {
      if (!event.url.startsWith(NATIVE_OAUTH_CALLBACK_URL)) return;

      await Browser.close().catch(() => {});
      const flow = takeNativeOAuthFlow();

      const url = new URL(event.url.replace("com.quizmon.app://", "https://placeholder/"));
      const code = url.searchParams.get("code");
      const { error } = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: new Error("missing code") };

      if (error) {
        window.dispatchEvent(
          new CustomEvent(NATIVE_OAUTH_ERROR_EVENT, { detail: { flow, message: error.message } })
        );
        return;
      }
      if (flow === "link") window.location.assign("/pet");
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
