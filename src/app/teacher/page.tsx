import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateClassroomButton from "./CreateClassroomButton";

// /teacher — 2-tier gate: DB (is_teacher() ผ่าน RLS/RPC ทุกจุดเขียนอยู่แล้ว) + client-side UI gate นี้
export default async function TeacherHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isTeacher } = await supabase.rpc("is_teacher");
  if (!isTeacher) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-gold-hi">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="mt-2 text-sm text-text3">หน้านี้สำหรับครูเท่านั้น</p>
      </main>
    );
  }

  const { data: sessions } = await supabase
    .from("classroom_sessions")
    .select("id, join_code, status, current_activity, created_at")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const STATUS_TH: Record<string, string> = {
    lobby: "รอเริ่ม",
    active: "กำลังใช้งาน",
    ended: "จบแล้ว",
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gold-hi">ห้องเรียน</h1>
        <CreateClassroomButton />
      </div>

      <ul className="mt-6 space-y-2">
        {(sessions ?? []).map((s) => (
          <li key={s.id}>
            <Link
              href={`/teacher/${s.id}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:border-gold-dim"
            >
              <span className="font-mono text-lg tracking-widest text-gold-hi">{s.join_code}</span>
              <span className="text-sm text-text2">{STATUS_TH[s.status] ?? s.status}</span>
            </Link>
          </li>
        ))}
        {(sessions ?? []).length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text3">
            ยังไม่มีห้องเรียน — กด &ldquo;เปิดห้องเรียน&rdquo; เพื่อเริ่ม
          </li>
        )}
      </ul>
    </main>
  );
}
