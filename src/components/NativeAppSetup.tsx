"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";

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

  // สปายก์ทดสอบขั้นต่ำ: แค่พิสูจน์ว่า register + รับ push token ได้จริงในโหมด remote URL
  // ยังไม่ใช่ UX จริง — log + alert ให้เห็นชัดแม้ไม่ต่อ debugger เพื่อ verify บนเครื่องจริง
  // Android ต้องมี google-services.json (Firebase) ก่อนถึงจะ register ผ่าน, iOS ต้องมี APNs cert
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const registrationListener = PushNotifications.addListener("registration", (token) => {
      console.log("[push] registration success, token:", token.value);
      window.alert(`Push token:\n${token.value}`);
    });

    const errorListener = PushNotifications.addListener("registrationError", (error) => {
      console.error("[push] registration error:", error);
      window.alert(`Push registration error:\n${JSON.stringify(error)}`);
    });

    PushNotifications.requestPermissions().then((result) => {
      if (result.receive === "granted") {
        PushNotifications.register();
      } else {
        console.warn("[push] permission not granted:", result.receive);
      }
    });

    return () => {
      registrationListener.then((listener) => listener.remove());
      errorListener.then((listener) => listener.remove());
    };
  }, []);

  return null;
}
