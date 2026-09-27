import "server-only";
import Stripe from "stripe";

// Stripe client ฝั่ง server เท่านั้น (premium เฟส 4) — ไม่ pin apiVersion: ใช้ค่า default ของ SDK
// ที่ติดตั้งอยู่ ตอนตั้ง webhook endpoint ใน Stripe dashboard ต้องเลือก API version ให้ตรงกับของ SDK
// สร้างแบบ lazy — env หายแล้ว throw ตอนเรียกใช้จริง ไม่ใช่ตอน import (ไม่ให้ build พังในเครื่องที่ไม่มี key)

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[stripe] missing env ${name}`);
  return value;
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) client = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return client;
}

export function getStripePriceId(): string {
  return requireEnv("STRIPE_PRICE_ID");
}

export function getStripeWebhookSecret(): string {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}
