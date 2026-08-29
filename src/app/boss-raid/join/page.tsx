import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JoinForm from "./JoinForm";

// นักเรียนเข้าห้องด้วยรหัส (หรือ ?code= จากลิงก์/QR) — join ผ่าน RPC แล้วเด้งเข้าจอห้อง
export default async function BossRaidJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // NOTE (0.1): หน้า /login ยังไม่รองรับ ?next= — logged-out ต้องล็อกอินก่อนแล้วเปิดลิงก์ซ้ำ
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold text-gold-hi">เข้าห้อง Boss Raid</h1>
      <p className="mt-1 text-sm text-text3">กรอกรหัสห้อง 6 หลักจากครู</p>
      <JoinForm initialCode={code ?? ""} />
    </main>
  );
}
