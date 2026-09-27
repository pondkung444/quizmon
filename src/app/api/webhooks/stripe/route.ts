import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe webhook (premium เฟส 4) — จุดเดียวที่ให้สิทธิ์พรีเมียมจากการจ่ายเงินจริง
// - verify signature จาก raw body เสมอ ผิด → 400
// - PromptPay เป็น async: checkout.session.completed มักมาด้วย payment_status 'unpaid' แล้วค่อยตามด้วย
//   async_payment_succeeded ตอนสแกนจ่ายเสร็จ → grant เฉพาะเมื่อ 'paid' เท่านั้น
// - grant_premium idempotent (order ที่ granted แล้วไม่บวกวันซ้ำ) → Stripe ส่ง event ซ้ำ/retry ได้ปลอดภัย
// - error ชั่วคราว (DB/network) ตอบ 500 ให้ Stripe retry ส่วน error ถาวรจาก grant_premium (raise exception:
//   status ไม่ใช่ pending / นักเรียนลบบัญชีไปแล้ว) log แล้วตอบ 200 — retry ไปก็ไม่หาย ต้องคืนเงินมือ

const MARK_FAILED_EVENTS = new Set<string>(["checkout.session.async_payment_failed", "checkout.session.expired"]);

type Admin = ReturnType<typeof createAdminClient>;

async function findOrderId(admin: Admin, session: Stripe.Checkout.Session): Promise<string | null> {
  const { data, error } = await admin
    .from("premium_orders")
    .select("id")
    .eq("provider", "stripe")
    .eq("provider_ref", session.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id as string;

  // fallback: checkout route บันทึก provider_ref ไม่สำเร็จ — หาจาก metadata ที่เราใส่ไว้เอง
  const metaOrderId = session.metadata?.order_id;
  if (!metaOrderId) return null;
  const { data: byMeta, error: metaError } = await admin
    .from("premium_orders")
    .select("id")
    .eq("provider", "stripe")
    .eq("id", metaOrderId)
    .maybeSingle();
  if (metaError) throw metaError;
  return (byMeta?.id as string | undefined) ?? null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing stripe-signature header");
    event = getStripe().webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 });
  }

  const isGrantEvent =
    event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  if (!isGrantEvent && !MARK_FAILED_EVENTS.has(event.type)) {
    console.log("[webhooks/stripe] ignored event:", event.type, event.id);
    return NextResponse.json({ ok: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
    // PromptPay ยังไม่สแกนจ่าย — รอ async_payment_succeeded / async_payment_failed
    console.log("[webhooks/stripe] completed but not paid yet:", session.id, session.payment_status);
    return NextResponse.json({ ok: true });
  }

  try {
    const admin = createAdminClient();
    const orderId = await findOrderId(admin, session);
    if (!orderId) {
      console.error("[webhooks/stripe] order not found:", event.type, session.id, session.metadata);
      return NextResponse.json({ ok: true });
    }

    if (isGrantEvent) {
      const { data, error } = await admin.rpc("grant_premium", { p_order_id: orderId });
      if (error) {
        // P0001 = raise exception ใน grant_premium → ถาวร ไม่ต้องให้ Stripe retry
        if (error.code === "P0001") {
          console.error("[webhooks/stripe] grant_premium rejected (needs manual check/refund):", orderId, error.message);
          return NextResponse.json({ ok: true });
        }
        throw error;
      }
      console.log("[webhooks/stripe] granted:", orderId, event.type, data);
      return NextResponse.json({ ok: true });
    }

    // async_payment_failed / expired → failed เฉพาะที่ยัง pending (ไม่ทับ order ที่ granted แล้ว)
    const { error } = await admin
      .from("premium_orders")
      .update({ status: "failed", note: event.type })
      .eq("id", orderId)
      .eq("status", "pending");
    if (error) throw error;
    console.log("[webhooks/stripe] marked failed (if pending):", orderId, event.type);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhooks/stripe] handler failed:", event.type, event.id, err);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
