import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronRight, Dices, KeyRound, Play, Swords, Target, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatJoinCode } from "@/lib/classroom/roster";
import {
  accuracyPct,
  accuracyTone,
  formatMinutes,
  formatRelativeDay,
  TONE_BG,
  TONE_TEXT,
  type DashboardClass,
  type TeacherDashboard,
} from "@/lib/classroom/dashboard";
import SessionRow from "@/components/classroom/SessionRow";
import { AddClassCard, StartClassButton, StartClassPicker } from "./StartClass";

// /teacher — หน้าแรกครู: บอกว่าระบบนี้คืออะไร, คาบที่เปิดอยู่, ผล 30 วัน, ห้องเรียนถาวร, คาบล่าสุด
// 2-tier gate: DB (is_teacher() ใน RPC) + UI gate นี้
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

  const [{ data: dash, error }, { data: profile }] = await Promise.all([
    supabase.rpc("get_teacher_dashboard", { p_days: 30 }),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ]);

  if (error || !dash) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12 text-center text-text3">
        โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง
      </main>
    );
  }

  const d = dash as TeacherDashboard;
  // eslint-disable-next-line react-hooks/purity -- server component, คำนวณครั้งเดียวต่อ request
  const now = new Date(Date.now());
  const isNew = d.classes.length === 0 && d.recent_sessions.length === 0;
  const raidPct = accuracyPct(d.stats.raid_correct, d.stats.raid_answers);
  const name = profile?.username;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 lg:px-8">
      {/* ---------- header ---------- */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gold-hi">{name ? `สวัสดี ครู${name}` : "ห้องเรียนของครู"}</h1>
          <p className="mt-1 max-w-xl text-sm text-text2">
            เปิดคาบ ให้นักเรียนกรอกรหัส แล้วเล่นกิจกรรมทบทวนบทเรียนพร้อมกันทั้งห้อง —
            ผลของทุกคาบเก็บไว้ให้ดูย้อนหลังที่นี่
          </p>
        </div>
        <StartClassPicker
          classes={d.classes.map((c) => ({ id: c.id, name: c.name, openSessionId: c.open_session?.id ?? null }))}
        />
      </header>

      {/* ---------- คาบที่เปิดอยู่ ---------- */}
      {d.open_sessions.length > 0 && (
        <div className="mt-6 space-y-2">
          {d.open_sessions.map((s) => (
            <Link
              key={s.id}
              href={`/teacher/${s.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-good/50 bg-good/10 px-4 py-3 transition hover:bg-good/15"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-good" />
              </span>
              <span className="font-bold text-text">{s.title ?? "ห้องไม่มีชื่อ"} เปิดอยู่</span>
              <span className="text-sm text-text2">
                รหัส <span className="font-mono font-bold text-gold-hi">{formatJoinCode(s.join_code)}</span>
                {" · "}นักเรียน {s.participants} คน
              </span>
              <span className="ml-auto flex items-center gap-1 text-sm font-bold text-good">
                กลับเข้าห้อง <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {isNew ? (
        <Onboarding />
      ) : (
        <>
          {/* ---------- สรุป 30 วัน ---------- */}
          <section className="mt-8">
            <h2 className="text-sm font-bold text-text2">{d.days} วันที่ผ่านมา</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="คาบที่สอน" value={d.stats.sessions.toLocaleString("th-TH")} />
              <Stat label="นักเรียนที่เข้าร่วม" value={d.stats.students.toLocaleString("th-TH")} unit="คน" />
              <Stat
                label="ตอบถูกใน Boss Raid"
                value={raidPct === null ? "–" : `${raidPct}%`}
                hint={d.stats.raid_answers > 0 ? `${d.stats.raid_answers.toLocaleString("th-TH")} คำตอบ` : "ยังไม่ได้เล่น"}
                valueClass={TONE_TEXT[accuracyTone(raidPct)]}
              />
              <Stat
                label="เวลาตั้งใจเรียนรวม"
                value={formatMinutes(d.stats.focus_seconds)}
                unit="นาที"
                hint="รวมทุกคนในคาบตั้งใจ"
              />
            </div>
          </section>

          {/* ---------- ห้องเรียนของฉัน ---------- */}
          <section className="mt-8">
            <h2 className="text-sm font-bold text-text2">ห้องเรียนของฉัน</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.classes.map((c) => (
                <ClassCard key={c.id} c={c} now={now} />
              ))}
              <AddClassCard />
            </div>
          </section>

          {/* ---------- คาบล่าสุด ---------- */}
          <section className="mt-8">
            <h2 className="text-sm font-bold text-text2">คาบล่าสุด</h2>
            {d.recent_sessions.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text3">
                ยังไม่มีคาบ — กด “เริ่มคาบ” ที่การ์ดห้องได้เลย
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {d.recent_sessions.map((s) => (
                  <SessionRow key={s.id} s={s} now={now} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
  valueClass = "text-text",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3.5">
      <p className="text-xs text-text3">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${valueClass}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-text3">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-xs text-text3">{hint}</p>}
    </div>
  );
}

function ClassCard({ c, now }: { c: DashboardClass; now: Date }) {
  const pct = accuracyPct(c.raid_correct, c.raid_answers);
  const tone = accuracyTone(pct);
  return (
    <div className="relative flex min-h-[148px] flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-gold-dim">
      <Link href={`/teacher/classes/${c.id}`} className="absolute inset-0 rounded-2xl" aria-label={`ดูประวัติ ${c.name}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-lg font-bold text-text">{c.name}</p>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text3" />
      </div>
      <p className="text-xs text-text3">
        {c.student_count} คน · {c.session_count} คาบ
        {c.last_session_at && ` · ล่าสุด${formatRelativeDay(c.last_session_at, now)}`}
      </p>

      <div className="mt-3">
        {pct === null ? (
          <p className="text-xs text-text3">ยังไม่มีผล Boss Raid</p>
        ) : (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-track">
              <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-text3">
              ตอบถูก <span className={`font-bold ${TONE_TEXT[tone]}`}>{pct}%</span>
            </p>
          </>
        )}
      </div>

      <div className="relative mt-auto flex items-center justify-between gap-2 pt-3">
        {c.open_session ? (
          <span className="text-xs text-good">
            เปิดอยู่ · {c.open_session.participants} คน
          </span>
        ) : (
          <span />
        )}
        <StartClassButton classId={c.id} openSessionId={c.open_session?.id ?? null} compact />
      </div>
    </div>
  );
}

// ครูใหม่: ยังไม่มีห้อง/คาบ — อธิบายว่าระบบนี้คืออะไร ทำงานยังไง
function Onboarding() {
  const steps = [
    { icon: <Play className="h-5 w-5" />, title: "เริ่มคาบ", desc: "ตั้งชื่อห้อง เช่น ม.3/1 วิทย์ แล้วกดเริ่ม" },
    { icon: <KeyRound className="h-5 w-5" />, title: "นักเรียนกรอกรหัส", desc: "เปิด quizmon.xyz/join ใส่รหัส 6 หลักบนจอ" },
    { icon: <Users className="h-5 w-5" />, title: "เล่นกิจกรรมพร้อมกัน", desc: "เห็นชื่อ + Qmon ของทุกคนขึ้นจอทันที" },
  ];
  const activities = [
    { icon: <Swords className="h-5 w-5" />, title: "Boss Raid", desc: "ทั้งห้องช่วยกันตอบคำถามตีบอส — ได้ % ตอบถูกแยกรายคนและรายบท" },
    { icon: <Target className="h-5 w-5" />, title: "คาบตั้งใจ", desc: "นักเรียนวางมือถือ ตั้งใจเรียน ใครออกจากแอปรู้ทันที" },
    { icon: <Dices className="h-5 w-5" />, title: "สุ่มรายชื่อ", desc: "สุ่มคนตอบคำถาม โชว์ชื่อพร้อม Qmon บนจอ" },
  ];
  return (
    <>
      <section className="mt-8 rounded-3xl border border-gold-dim bg-card p-6">
        <h2 className="font-bold text-text">เริ่มใช้ใน 3 ขั้น</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber text-on-amber">
                {s.icon}
              </span>
              <span>
                <span className="block text-sm font-bold text-text">
                  {i + 1}. {s.title}
                </span>
                <span className="mt-0.5 block text-xs text-text3">{s.desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-bold text-text2">กิจกรรมในคาบ</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {activities.map((a) => (
            <div key={a.title} className="rounded-2xl border border-border bg-card p-4">
              <span className="flex items-center gap-2 font-bold text-text">
                <span className="text-gold-hi">{a.icon}</span>
                {a.title}
              </span>
              <p className="mt-1 text-xs text-text3">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AddClassCard />
        </div>
      </section>
    </>
  );
}
