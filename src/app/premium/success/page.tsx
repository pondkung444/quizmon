import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import SuccessStatus, { type OrderView } from "./SuccessStatus";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// หน้าที่ Stripe พากลับมาหลังจ่าย (success_url) — สถานะมาจาก DB เท่านั้น ไม่เชื่อ query string
// query string ใช้แค่เป็น order id และต้องเป็น order ของผู้ใช้ที่ login อยู่ (RLS + eq student_id ซ้ำอีกชั้น)
// สิทธิ์จริงให้โดย webhook — ถ้ายัง pending ให้ SuccessStatus poll ด้วย router.refresh()
export default async function PremiumSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const user = await getUser();
  if (!user) redirect("/");

  const { order } = await searchParams;
  const orderId = typeof order === "string" && UUID_RE.test(order) ? order : null;

  let view: OrderView = { status: "not_found" };
  if (orderId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("premium_orders")
      .select("status, expires_after")
      .eq("id", orderId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (data?.status === "granted") {
      view = { status: "granted", expiresAt: data.expires_after as string | null };
    } else if (data?.status === "pending") {
      view = { status: "pending" };
    } else if (data) {
      view = { status: "failed" };
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 p-4 pb-24">
      <SuccessStatus view={view} />
    </main>
  );
}
