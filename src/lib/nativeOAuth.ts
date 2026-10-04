import { Browser } from "@capacitor/browser";

// deep link ที่ system browser ส่งกลับเข้าแอปหลัง Google consent (ต้องตรงกับ intent-filter ใน AndroidManifest)
export const NATIVE_OAUTH_CALLBACK_URL = "com.quizmon.app://login-callback";

// event ที่ NativeAppSetup ยิงเมื่อ exchange code ไม่สำเร็จ — หน้า/โมดัลที่เริ่ม flow ฟังเพื่อโชว์ error
export const NATIVE_OAUTH_ERROR_EVENT = "native-oauth-error";

// "login" = เข้าสู่ระบบ (หน้า /login) · "link" = guest ผูกไอดีกับ Google (GuestUpgradeGate)
// เก็บใน sessionStorage เพราะ listener กลาง (NativeAppSetup) ต้องรู้ว่า flow ไหนเป็นคนเริ่ม
export type NativeOAuthFlow = "login" | "link";
const FLOW_KEY = "native_oauth_flow";

export function setNativeOAuthFlow(flow: NativeOAuthFlow) {
  try {
    sessionStorage.setItem(FLOW_KEY, flow);
  } catch {
    /* private mode — ข้ามได้ ค่า default = login */
  }
}

export function takeNativeOAuthFlow(): NativeOAuthFlow {
  try {
    const flow = sessionStorage.getItem(FLOW_KEY);
    sessionStorage.removeItem(FLOW_KEY);
    return flow === "link" ? "link" : "login";
  } catch {
    return "login";
  }
}

// เปิด consent screen ผ่าน system browser (Google บล็อก embedded WebView: disallowed_useragent)
export async function openNativeOAuth(url: string, flow: NativeOAuthFlow) {
  setNativeOAuthFlow(flow);
  await Browser.open({ url });
}
