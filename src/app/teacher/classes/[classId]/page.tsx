import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  accuracyPct,
  accuracyTone,
  formatMinutes,
  formatRelativeDay,
  needsAttention,
  TONE_BG,
  TONE_TEXT,
  type ClassDetail,
  type ClassStudent,
} from "@/lib/classroom/dashboard";
import { resolveRosterPet, rosterDisplayName } from "@/lib/classroom/roster";
import RosterAvatar from "@/components/classroom/RosterAvatar";
import SessionRow from "@/components/classroom/SessionRow";
import { StartClassButton } from "../../StartClass";
import { ArchiveClassButton, ClassNameEditor } from "./ClassHeaderActions";

// /teacher/classes/[classId] — ห้อง ม.3/1: ทำอะไรไปแล้ว ผลเป็นไง ใครควรดูแล บทไหนอ่อน
export default async function TeacherClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("get_teacher_class_detail", { p_class_id: classId });
  if (error || !data) redirect("/teacher");

  const d = data as ClassDetail;
  // eslint-disable-next-line react-hooks/purity -- server component, คำนวณครั้งเดียวต่อ request
  const now = new Date(Date.now());
  const openSession = d.sessions.find((s) => s.status !== "ended") ?? null;

  const students = [...d.students].sort((a, b) => {
    const an = a.student_number ?? Number.POSITIVE_INFINITY;
    const bn = b.student_number ?? Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    return rosterDisplayName(a).localeCompare(rosterDisplayName(b), "th");
  });
  const raidTotal = students.reduce((n, s) => n + s.raid_answers, 0);
  const raidCorrect = students.reduce((n, s) => n + s.raid_correct, 0);
  const classPct = accuracyPct(raidCorrect, raidTotal);
  const focusSeconds = students.reduce((n, s) => n + s.focus_seconds, 0);
  const attention = students
    .map((s) => ({ s, reason: needsAttention(s, d.total_sessions) }))
    .filter((x): x is { s: ClassStudent; reason: string } => x.reason !== null);
  const topics = d.topics.filter((t) => t.answers >= 3).slice(0, 8);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 lg:px-8">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/teacher"
          aria-label="กลับหน้าแรก"
          className="rounded-xl border border-border p-2 text-text2 transition hover:border-gold-dim hover:text-gold-hi"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <ClassNameEditor classId={d.class.id} name={d.class.name} />
        <div className="ml-auto">
          {!d.class.archived_at && (
            <StartClassButton classId={d.class.id} openSessionId={openSession?.id ?? null} />
          )}
        </div>
      </header>

      {/* ---------- สรุป ---------- */}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="คาบทั้งหมด" value={d.total_sessions.toLocaleString("th-TH")} />
        <Tile label="นักเรียน" value={students.length.toLocaleString("th-TH")} unit="คน" />
        <Tile
          label="ตอบถูกใน Boss Raid"
          value={classPct === null ? "–" : `${classPct}%`}
          valueClass={TONE_TEXT[accuracyTone(classPct)]}
          hint={raidTotal > 0 ? `${raidTotal.toLocaleString("th-TH")} คำตอบ` : "ยังไม่ได้เล่น"}
        />
        <Tile label="เวลาตั้งใจเรียนรวม" value={formatMinutes(focusSeconds)} unit="นาที" />
      </section>

      {students.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text3">
          ยังไม่มีนักเรียนในห้องนี้ — กด “เริ่มคาบ” แล้วให้นักเรียนกรอกรหัส
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {/* ---------- ควรดูแล ---------- */}
            <section className="rounded-3xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 font-bold text-text">
                <AlertTriangle className="h-4 w-4 text-warn" /> นักเรียนที่ควรดูแล
              </h2>
              {attention.length === 0 ? (
                <p className="mt-3 text-sm text-text3">ยังไม่มี — ทุกคนตอบถูกเกินครึ่งและเข้าเรียนสม่ำเสมอ</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {attention.slice(0, 6).map(({ s, reason }) => (
                    <li key={s.user_id} className="flex items-center gap-3">
                      <RosterAvatar pet={resolveRosterPet({ ...s, joined_at: s.last_seen })} name={rosterDisplayName(s)} size={36} />
                      <span className="min-w-0 flex-1 truncate text-sm text-text">
                        {s.student_number !== null && <span className="text-gold-hi">{s.student_number}. </span>}
                        {rosterDisplayName(s)}
                      </span>
                      <span className="shrink-0 text-xs text-warn">{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ---------- บทเรียน ---------- */}
            <section className="rounded-3xl border border-border bg-card p-4">
              <h2 className="font-bold text-text">ผลรายบท (จาก Boss Raid)</h2>
              {topics.length === 0 ? (
                <p className="mt-3 text-sm text-text3">เล่น Boss Raid แล้วจะเห็นว่าบทไหนห้องนี้ยังอ่อน</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {topics.map((t) => {
                    const pct = accuracyPct(t.correct, t.answers) ?? 0;
                    const tone = accuracyTone(pct);
                    return (
                      <li key={`${t.subject}-${t.chapter}`}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate text-text">{t.chapter}</span>
                          <span className={`shrink-0 font-bold ${TONE_TEXT[tone]}`}>{pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-track">
                          <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* ---------- รายชื่อนักเรียน ---------- */}
          <section className="mt-8">
            <h2 className="text-sm font-bold text-text2">รายชื่อนักเรียน</h2>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text3">
                    <th className="px-4 py-2.5 font-normal">นักเรียน</th>
                    <th className="px-3 py-2.5 text-right font-normal">เข้าเรียน</th>
                    <th className="px-3 py-2.5 text-right font-normal">ตอบถูก</th>
                    <th className="px-3 py-2.5 text-right font-normal">ตั้งใจ (นาที)</th>
                    <th className="px-4 py-2.5 text-right font-normal">ล่าสุด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s) => {
                    const pct = accuracyPct(s.raid_correct, s.raid_answers);
                    return (
                      <tr key={s.user_id}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <RosterAvatar
                              pet={resolveRosterPet({ ...s, joined_at: s.last_seen })}
                              name={rosterDisplayName(s)}
                              size={36}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-text">
                                {s.student_number !== null && (
                                  <span className="text-gold-hi">{s.student_number}. </span>
                                )}
                                {rosterDisplayName(s)}
                              </p>
                              {s.display_name && s.username && (
                                <p className="truncate text-xs text-text3">@{s.username}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-text2">
                          {s.attended}/{d.total_sessions}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${TONE_TEXT[accuracyTone(pct)]}`}>
                          {pct === null ? "–" : `${pct}%`}
                          {s.raid_answers > 0 && (
                            <span className="ml-1 text-xs font-normal text-text3">({s.raid_answers})</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-text2">
                          {s.focus_seconds > 0 ? formatMinutes(s.focus_seconds) : "–"}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-text3">
                          {formatRelativeDay(s.last_seen, now)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ---------- ประวัติคาบ ---------- */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-text2">ประวัติคาบ</h2>
        {d.sessions.length === 0 ? (
          <p className="mt-2 text-sm text-text3">ยังไม่มีคาบ</p>
        ) : (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {d.sessions.map((s) => (
              <SessionRow key={s.id} s={s} now={now} showTitle={false} />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 text-center">
        <ArchiveClassButton classId={d.class.id} name={d.class.name} />
      </div>
    </main>
  );
}

function Tile({
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
