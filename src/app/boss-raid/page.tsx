import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateSessionButton from "./CreateSessionButton";

// รายการห้อง Boss Raid ของครู (คนที่ล็อกอินอยู่) + ปุ่มสร้างห้องใหม่
export default async function BossRaidHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sessions } = await supabase
    .from("boss_raid_sessions")
    .select("id, join_code, status, created_at")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const STATUS_TH: Record<string, string> = {
    lobby: "รอเริ่ม",
    in_progress: "กำลังเล่น",
    ended: "จบแล้ว",
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Boss Raid ห้องเรียน</h1>
        <CreateSessionButton />
      </div>

      <ul className="mt-6 space-y-2">
        {(sessions ?? []).map((s) => (
          <li key={s.id}>
            <Link
              href={`/boss-raid/${s.id}`}
              className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 hover:bg-black/5"
            >
              <span className="font-mono text-lg tracking-widest">{s.join_code}</span>
              <span className="text-sm text-black/60">{STATUS_TH[s.status] ?? s.status}</span>
            </Link>
          </li>
        ))}
        {(sessions ?? []).length === 0 && (
          <li className="rounded-lg border border-dashed border-black/15 px-4 py-6 text-center text-sm text-black/50">
            ยังไม่มีห้อง — กด &ldquo;สร้างห้อง&rdquo; เพื่อเริ่ม
          </li>
        )}
      </ul>
    </main>
  );
}
