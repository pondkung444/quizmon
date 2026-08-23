import crypto from "crypto";

// แลก access token จาก Firebase service account key ผ่าน Google OAuth2
// ไม่ใช้ firebase-admin/google-auth-library เพราะ bundle หนักเกินจำเป็นสำหรับแค่เซ็น JWT
// เซิร์ฟเวอร์-only ห้าม import จากไฟล์ที่มี "use client" เด็ดขาด

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
};

let cachedServiceAccount: ServiceAccount | null = null;
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount {
  if (cachedServiceAccount) return cachedServiceAccount;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var ไม่ได้ตั้งค่า");

  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key || !parsed.token_uri) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON รูปแบบไม่ถูกต้อง ขาดฟิลด์ที่จำเป็น");
  }

  cachedServiceAccount = parsed as ServiceAccount;
  return cachedServiceAccount;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(serviceAccount: ServiceAccount): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(serviceAccount.private_key));

  return `${unsigned}.${signature}`;
}

/**
 * คืน access token สำหรับเรียก FCM HTTP v1 API — cache ไว้ในหน่วยความจำระหว่าง
 * invocation เดียวกัน (warm instance) กันเรียก OAuth ซ้ำทุกข้อความเวลายิงหลาย user รอบเดียว
 */
export async function getFcmAccessToken(): Promise<{ accessToken: string; projectId: string }> {
  const serviceAccount = getServiceAccount();

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return { accessToken: cachedToken.accessToken, projectId: serviceAccount.project_id };
  }

  const jwt = signJwt(serviceAccount);
  const res = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ขอ FCM OAuth token ไม่สำเร็จ: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return { accessToken: cachedToken.accessToken, projectId: serviceAccount.project_id };
}
