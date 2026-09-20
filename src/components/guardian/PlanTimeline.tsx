import {
  formatRange,
  formatShortDate,
  type ExamInfo,
  type PlacedChapter,
  type SubjectSchedule,
  type WeekInfo,
} from "@/lib/planSchedule";

// สี: คณิต = indigo, วิทย์ = sci (cyan), "ผ่านแล้ว" = good/mint (สงวนไว้ ไม่ใช้กับวิชา)
const SUBJECT_STYLE: Record<string, { label: string; text: string; bar: string; dot: string }> = {
  math: { label: "คณิตศาสตร์", text: "text-indigo-hi", bar: "border-l-indigo", dot: "bg-indigo" },
  science: { label: "วิทยาศาสตร์", text: "text-sci-hi", bar: "border-l-sci", dot: "bg-sci" },
};
const FALLBACK_STYLE = { label: "", text: "text-text", bar: "border-l-text3", dot: "bg-text3" };

function chipClass(status: PlacedChapter["status"]): string {
  switch (status) {
    case "passed":
      return "border border-good/60 bg-good/15 text-good";
    case "current":
      return "border-2 border-amber bg-amber/15 text-text";
    case "stuck":
      return "border-2 border-warn bg-red/15 text-text";
    default:
      return "border border-dashed border-text3 bg-transparent text-text2";
  }
}

function Chip({ c, subjectKey }: { c: PlacedChapter; subjectKey: string }) {
  const s = SUBJECT_STYLE[subjectKey] ?? FALLBACK_STYLE;
  return (
    <div className={`rounded-lg border-l-4 px-2 py-1.5 text-xs leading-snug ${s.bar} ${chipClass(c.status)}`}>
      <p className="line-clamp-2">
        {c.status === "passed" && "✓ "}
        {c.chapter}
      </p>
      {c.status === "current" && <p className="mt-0.5 text-[10px] font-semibold text-amber">กำลังเรียน</p>}
      {c.status === "stuck" && <p className="mt-0.5 text-[10px] font-semibold text-red">ค้างนาน</p>}
    </div>
  );
}

// ตารางสัปดาห์แนวนอน: ทุกคอลัมน์มีหมายเลขสัปดาห์ + ช่วงวันที่กำกับเสมอ, แถวตามวิชา
export default function PlanTimeline({
  weeks,
  schedules,
  exam,
}: {
  weeks: WeekInfo[];
  schedules: SubjectSchedule[];
  exam?: ExamInfo | null;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid gap-x-2 gap-y-2"
        style={{
          gridTemplateColumns: `repeat(${weeks.length}, minmax(112px, 1fr))${exam ? " minmax(84px, 0.6fr)" : ""}`,
        }}
      >
        {weeks.map((w) => (
          <div
            key={w.index}
            className={`rounded-lg px-2 py-1.5 text-center ${w.isCurrent ? "border-2 border-amber bg-amber/15" : "border border-border bg-card"}`}
          >
            <p className={`text-xs font-bold ${w.isCurrent ? "text-amber" : "text-text"}`}>
              สัปดาห์ {w.index + 1}
              {w.isCurrent && " · ตอนนี้"}
            </p>
            <p className="text-[10px] text-text3">{formatRange(w.startYmd, w.endYmd)}</p>
          </div>
        ))}
        {exam && (
          <div className="rounded-lg border border-gold bg-gold/10 px-2 py-1.5 text-center">
            <p className="text-xs font-bold text-gold-hi">🚩 วันสอบ</p>
            <p className="text-[10px] text-text3">{formatShortDate(exam.examYmd)}</p>
          </div>
        )}

        {schedules.map((sched) => {
          const s = SUBJECT_STYLE[sched.subject] ?? FALLBACK_STYLE;
          return (
            <SubjectRow key={`${sched.subject}|${sched.branch ?? ""}`} sched={sched} weeks={weeks} hasExam={!!exam} s={s} />
          );
        })}
      </div>
    </div>
  );
}

function SubjectRow({
  sched,
  weeks,
  hasExam,
  s,
}: {
  sched: SubjectSchedule;
  weeks: WeekInfo[];
  hasExam: boolean;
  s: (typeof SUBJECT_STYLE)[string];
}) {
  const span = weeks.length + (hasExam ? 1 : 0);
  return (
    <>
      <div className="col-span-full mt-2 flex flex-wrap items-center gap-2" style={{ gridColumn: `1 / span ${span}` }}>
        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
        <span className={`text-sm font-bold ${s.text}`}>{s.label || sched.subject}</span>
        {sched.beforePlan.length > 0 && (
          <span className="rounded-full border border-good/60 bg-good/10 px-2 py-0.5 text-[11px] text-good">
            ✓ ผ่านมาก่อนแผน {sched.beforePlan.length} บท
          </span>
        )}
      </div>
      {weeks.map((w) => (
        <div key={w.index} className="flex flex-col gap-1.5">
          {sched.placed
            .filter((c) => c.weekIndex === w.index)
            .map((c) => (
              <Chip key={c.chapter_key} c={c} subjectKey={sched.subject} />
            ))}
        </div>
      ))}
      {hasExam && <div />}
    </>
  );
}

export function PlanTimelineLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text2">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm border border-good/60 bg-good/30" /> ผ่านแล้ว
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm border-2 border-amber bg-amber/30" /> กำลังเรียน
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-text3" /> รอคิว (ประมาณการ)
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-indigo" /> คณิต
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-sci" /> วิทย์
      </span>
    </div>
  );
}
