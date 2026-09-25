import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatJoinCode } from "@/lib/classroom/roster";
import CreateClassroomButton from "./CreateClassroomButton";

// ห้องที่ไม่ได้กดปิดจะหมดอายุเอง 12 ชม. หลังสร้าง (expire_stale_classroom_sessions ทำงานตอน create/join
// เท่านั้น — หน้านี้จึงคำนวณเองด้วย กันห้องค้างโชว์ว่ายังเปิดอยู่)
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type Row = {
  id: string;
  join_code: string;
  title: string | null;
  status: string;
  created_at: string;
  classroom_participants: { count: number }[];
};

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

  const { data } = await supabase
    .from("classroom_sessions")
    .select("id, join_code, title, status, created_at, classroom_participants(count)")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  // eslint-disable-next-line react-hooks/purity -- server component, คำนวณครั้งเดียวต่อ request
  const now = Date.now();
  const rows = (data as Row[] | null) ?? [];
  const isOpen = (r: Row) => r.status !== "ended" && now - new Date(r.created_at).getTime() < ROOM_TTL_MS;
  const open = rows.filter(isOpen);
  const past = rows.filter((r) => !isOpen(r));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gold-hi">ห้องเรียน</h1>
          <p className="mt-1 text-sm text-text3">เปิดห้อง ให้นักเรียนกรอกรหัส แล้วเลือกกิจกรรมได้เลย</p>
        </div>
        <CreateClassroomButton />
      </div>

      {open.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-text2">เปิดอยู่</h2>
          <ul className="mt-2 space-y-2">
            {open.map((r) => (
              <RoomRow key={r.id} row={r} open />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-bold text-text2">ย้อนหลัง</h2>
        {past.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text3">
            {open.length === 0
              ? "ยังไม่มีห้องเรียน กด “เปิดห้องเรียน” เพื่อเริ่มคาบแรก"
              : "ยังไม่มีห้องที่ปิดแล้ว"}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
            {past.map((r) => (
              <RoomRow key={r.id} row={r} open={false} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function RoomRow({ row, open }: { row: Row; open: boolean }) {
  const count = row.classroom_participants[0]?.count ?? 0;
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-bold ${open ? "text-text" : "text-text2"}`}>
          {row.title ?? "ห้องไม่มีชื่อ"}
        </p>
        <p className="mt-0.5 text-xs text-text3">{dateFmt.format(new Date(row.created_at))}</p>
      </div>
      <span className="flex items-center gap-1 text-sm text-text3">
        <Users className="h-4 w-4" /> {count}
      </span>
      {open && (
        <span className="font-mono text-lg font-bold tracking-wider text-gold-hi">
          {formatJoinCode(row.join_code)}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-text3" />
    </>
  );

  return (
    <li>
      <Link
        href={`/teacher/${row.id}`}
        className={
          open
            ? "flex items-center gap-4 rounded-2xl border border-gold-dim bg-card px-4 py-4 transition hover:border-gold"
            : "flex items-center gap-4 px-4 py-3 transition hover:bg-track/40"
        }
      >
        {inner}
      </Link>
    </li>
  );
}
