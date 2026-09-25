import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClassroomJoinForm from "./ClassroomJoinForm";

// นักเรียนเข้าห้องเรียนด้วยรหัส 6 หลัก (หรือ ?code= จากลิงก์ที่ครูส่ง) — mirror ของ /boss-raid/join
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
      <h1 className="text-center text-2xl font-bold text-gold-hi">เข้าห้องเรียน</h1>
      <p className="mt-1 text-center text-sm text-text3">กรอกรหัส 6 หลักที่ครูให้</p>
      <ClassroomJoinForm initialCode={code ?? ""} />
    </main>
  );
}
