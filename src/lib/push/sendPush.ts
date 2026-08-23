import { getFcmAccessToken } from "@/lib/push/fcmAuth";

export type PushMessageInput = {
  token: string;
  title: string;
  body: string;
  deepLink?: string;
};

export type PushSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; errorCode: string; shouldInvalidateToken: boolean };

// payload มี block android + apns ตั้งแต่วันแรก แม้ยังไม่มี iOS device ลงทะเบียนเลยก็ตาม
// (เตรียมไว้เฉยๆ ไม่มีผลถ้า token ปลายทางเป็น android — วันเปิด iOS ไม่ต้องแก้ไฟล์นี้เลย)
export async function sendPushToDevice(input: PushMessageInput): Promise<PushSendResult> {
  const { accessToken, projectId } = await getFcmAccessToken();

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: input.token,
        notification: { title: input.title, body: input.body },
        data: input.deepLink ? { deep_link: input.deepLink } : undefined,
        android: { priority: "high" },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { sound: "default" } },
        },
      },
    }),
  });

  if (res.ok) {
    const data = (await res.json()) as { name: string };
    return { ok: true, providerMessageId: data.name };
  }

  const errBody = (await res.json().catch(() => null)) as
    | { error?: { status?: string; message?: string } }
    | null;
  const errorCode = errBody?.error?.status ?? `HTTP_${res.status}`;

  // token ตายถาวร (ถอนแอป/ล้างข้อมูล) -> ต้องปิด/ลบ push_devices แถวนี้ ไม่ใช่ retry
  const shouldInvalidateToken =
    errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT" || res.status === 404;

  return { ok: false, errorCode, shouldInvalidateToken };
}
