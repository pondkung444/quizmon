// "เครื่องนี้เคยเข้าสู่ระบบมาก่อน" flag — ใช้ตัดสินใจว่า /login จะขึ้น State A (ผู้มาใหม่)
// หรือ State C (อุปกรณ์ที่เคย login) โดยไม่ต้อง query server
//
// ตั้งค่าเฉพาะหลัง login/signup แบบ "ไม่ใช่ผู้มาเยือน (anonymous)" สำเร็จเท่านั้น
// ห้ามตั้งให้ guest / anonymous sign-in เด็ดขาด และห้ามลบที่ไหนนอกจาก hard sign-out

import { useSyncExternalStore } from "react";

export const SEEN_AUTH_KEY = "qm_seen_auth";

export function markSeenAuth(): void {
  try {
    localStorage.setItem(SEEN_AUTH_KEY, "1");
  } catch {
    // private mode / storage ปิด — ยอมให้ fallback เป็น State A
  }
}

export function hasSeenAuth(): boolean {
  try {
    return localStorage.getItem(SEEN_AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

// null = ยังไม่ resolve (ก่อน hydration เสร็จ) — ให้ caller ขึ้น placeholder กลางๆ ไปก่อน
// กัน hydration mismatch + กัน State A แว้บก่อน State C
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function useSeenAuth(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => hasSeenAuth(),
    () => null
  );
}
