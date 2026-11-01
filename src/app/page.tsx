import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { parseShareSource } from "@/lib/share/shareMoment";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ src?: string | string[] }>;
}) {
  const user = await getUser();
  if (user) redirect("/pet");

  // ลิงก์จากการ์ดแชร์: ส่ง src ต่อให้ /login นับที่มา (รับเฉพาะค่าที่รู้จัก)
  const { src } = await searchParams;
  const shareSrc = typeof src === "string" ? parseShareSource(`?src=${encodeURIComponent(src)}`) : null;
  redirect(shareSrc ? `/login?src=${shareSrc}` : "/login");
}
