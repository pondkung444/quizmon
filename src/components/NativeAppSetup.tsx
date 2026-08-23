"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { syncPushTokenSilently } from "@/lib/push/pushClient";

// จัดการปุ่ม back ของ Android (ระบบปิดแอปทันทีถ้าไม่ handle เอง แทนที่จะ navigate กลับในแอป)
export default function NativeAppSetup() {
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

  return null;
}
