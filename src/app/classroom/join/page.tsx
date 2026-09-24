import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClassroomJoinForm from "./ClassroomJoinForm";

// นักเรียนเข้าห้องเรียนด้วยรหัส (หรือ ?code= จากลิงก์/QR) — mirror ของ /boss-raid/join
export default async function ClassroomJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold text-gold-hi">เข้าห้องเรียน</h1>
      <p className="mt-1 text-sm text-text3">กรอกรหัสห้อง 6 หลักจากครู</p>
      <ClassroomJoinForm initialCode={code ?? ""} />
    </main>
  );
}
