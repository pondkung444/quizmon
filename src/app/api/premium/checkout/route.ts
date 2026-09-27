import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPremiumStatus } from "@/lib/selfServe";
import { getGradeBand } from "@/lib/gradeBand";
import { PREMIUM_DAYS, PREMIUM_PRICE_BAHT, PREMIUM_RENEW_WARN_DAYS, premiumDaysLeft } from "@/lib/premium";
import { getStripe, getStripePriceId } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// สร้าง order 'pending' + Stripe Checkout Session (PromptPay, จ่ายครั้งเดียว) แล้วคืน url ให้ client redirect
// ไม่ grant อะไรที่นี่ — สิทธิ์ให้เฉพาะจาก webhook (/api/webhooks/stripe) ผ่าน grant_premium(order_id)
// gate เดียวกับหน้า /premium: junior เท่านั้น, ยังไม่ active หรือเหลือ ≤ PREMIUM_RENEW_WARN_DAYS วัน (ต่ออายุ)

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return fail(401, "กรุณาเข้าสู่ระบบก่อน");
  // บัญชี guest ถูก cron ลบทิ้งได้ → order จะเหลือ student_id = NULL จ่ายแล้วสิทธิ์หาย ให้ผูกบัญชีก่อน
  if (user.is_anonymous === true) return fail(403, "ผูกบัญชีก่อนนะ ถึงจะปลดล็อกพรีเมียมได้");
  if ((await getGradeBand(user.id)) !== "junior") return fail(403, "พรีเมียมยังไม่เปิดสำหรับระดับชั้นนี้");

  const premium = await getPremiumStatus();
  if (premium.status === "active" && premiumDaysLeft(premium.expiresAt) > PREMIUM_RENEW_WARN_DAYS) {
    return fail(409, `เธอเป็นพรีเมียมอยู่แล้ว ต่ออายุได้เมื่อเหลือไม่เกิน ${PREMIUM_RENEW_WARN_DAYS} วัน`);
  }

  const admin = createAdminClient();
  const amountSatang = PREMIUM_PRICE_BAHT * 100;

  const { data: order, error: insertError } = await admin
    .from("premium_orders")
    .insert({ student_id: user.id, provider: "stripe", amount_satang: amountSatang, days: PREMIUM_DAYS })
    .select("id")
    .single();
  if (insertError || !order) {
    console.error("[premium/checkout] insert order failed:", insertError);
    return fail(500, "สร้างคำสั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้งนะ");
  }
  const orderId = order.id as string;

  const markFailed = async (note: string) => {
    const { error } = await admin
      .from("premium_orders")
      .update({ status: "failed", note })
      .eq("id", orderId)
      .eq("status", "pending");
    if (error) console.error("[premium/checkout] mark failed failed:", orderId, error);
  };

  try {
    const stripe = getStripe();
    const priceId = getStripePriceId();

    // กัน STRIPE_PRICE_ID ตั้งผิด (ราคา/สกุลเงินไม่ตรงกับที่หน้า /premium โชว์) → ไม่ให้เก็บเงินผิดจำนวน
    const price = await stripe.prices.retrieve(priceId);
    if (price.unit_amount !== amountSatang || price.currency !== "thb") {
      console.error("[premium/checkout] price mismatch:", priceId, price.unit_amount, price.currency);
      await markFailed(`price mismatch: ${price.unit_amount} ${price.currency}`);
      return fail(500, "ระบบจ่ายเงินตั้งค่าไม่ถูกต้อง ติดต่อครูปอนด์นะ");
    }

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["promptpay"],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: orderId,
      metadata: { student_id: user.id, order_id: orderId },
      success_url: `${origin}/premium/success?order=${orderId}`,
      cancel_url: `${origin}/premium`,
    });

    const { error: refError } = await admin
      .from("premium_orders")
      .update({ provider_ref: session.id })
      .eq("id", orderId);
    // ไม่ต้อง fail — webhook หา order ผ่าน metadata.order_id ได้อยู่ดี
    if (refError) console.error("[premium/checkout] save provider_ref failed:", orderId, refError);

    if (!session.url) throw new Error("checkout session has no url");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[premium/checkout] create session failed:", orderId, err);
    await markFailed(err instanceof Error ? err.message.slice(0, 500) : "create session failed");
    return fail(502, "เปิดหน้าจ่ายเงินไม่สำเร็จ ลองใหม่อีกครั้งนะ");
  }
}
