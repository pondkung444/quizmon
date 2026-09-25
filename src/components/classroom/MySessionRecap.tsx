import Image from "next/image";
import { Hand, Swords, Timer } from "lucide-react";
import { getPetImagePath } from "@/lib/petImage";
import { accuracyPct } from "@/lib/classroom/dashboard";
import {
  buildTimeline,
  summarizeMine,
  type MyClassroomSummary,
  type MyFocus,
  type MyRaid,
} from "@/lib/classroom/mySummary";

const timeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

// "คาบนี้ของฉัน" — สถิติรวม + ไทม์ไลน์กิจกรรมที่ทำไปแล้วในคาบ และของที่ได้
export default function MySessionRecap({
  summary,
  classEnded,
}: {
  summary: MyClassroomSummary;
  /** คาบจบแล้ว — Raid ที่ค้าง lobby = ครูไม่ได้เริ่ม ไม่ใช่ "รอเริ่ม" */
  classEnded: boolean;
}) {
  const totals = summarizeMine(summary);
  const timeline = buildTimeline(summary);
  const pct = accuracyPct(totals.correct, totals.answers);

  return (
    <section className="w-full rounded-2xl border border-border bg-card p-4">
      <h2 className="font-bold text-text">คาบนี้ของฉัน</h2>

      {totals.activities === 0 ? (
        <p className="mt-2 text-sm text-text3">
          ยังไม่มีกิจกรรม — เมื่อครูเริ่ม Boss Raid หรือคาบตั้งใจ
          ผลและรางวัลจะขึ้นที่นี่
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Stat
              value={
                totals.answers > 0 ? `${totals.correct}/${totals.answers}` : "–"
              }
              label="ตอบถูก"
              sub={pct !== null ? `${pct}%` : undefined}
            />
            <Stat
              value={totals.focusMinutes > 0 ? `${totals.focusMinutes}` : "–"}
              label="นาทีตั้งใจ"
            />
            <Stat
              value={totals.exp > 0 ? `+${totals.exp}` : "–"}
              label="EXP"
              highlight={totals.exp > 0}
            />
            <Stat
              value={totals.eggs > 0 ? `${totals.eggs}` : "–"}
              label="ไข่รางวัล"
              highlight={totals.eggs > 0}
            />
          </div>

          <ol className="mt-4 space-y-2">
            {timeline.map((item) =>
              item.kind === "raid" ? (
                <RaidRow
                  key={item.raid.id}
                  raid={item.raid}
                  classEnded={classEnded}
                />
              ) : (
                <FocusRow key={item.focus.id} focus={item.focus} />
              ),
            )}
            {summary.picks_total > 0 && (
              <Row
                icon={<Hand className="h-4 w-4" />}
                title={`สุ่มตอบ ${summary.picks_total} ครั้ง`}
              >
                {summary.picked_me > 0 ? (
                  <span className="font-bold text-gold-hi">
                    ถูกเรียก {summary.picked_me} ครั้ง
                  </span>
                ) : (
                  <span className="text-text3">ยังไม่ถูกเรียก</span>
                )}
              </Row>
            )}
          </ol>
        </>
      )}
    </section>
  );
}

function Stat({
  value,
  label,
  sub,
  highlight = false,
}: {
  value: string;
  label: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-track px-1 py-2.5 text-center">
      <p
        className={`text-lg font-bold leading-tight ${highlight ? "text-gold-hi" : "text-text"}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-text3">{label}</p>
      {sub && <p className="text-[11px] font-bold text-good">{sub}</p>}
    </div>
  );
}

function Row({
  icon,
  title,
  time,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  time?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-track text-text2">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text">
          {title}
          {time && (
            <span className="ml-1.5 text-xs font-normal text-text3">
              {time}
            </span>
          )}
        </p>
        <div className="text-xs">{children}</div>
      </div>
    </li>
  );
}

function RaidRow({ raid, classEnded }: { raid: MyRaid; classEnded: boolean }) {
  const notStarted = raid.status === "lobby" && classEnded;
  const outcome = notStarted
    ? { label: "ไม่ได้เริ่ม", cls: "text-text3" }
    : raid.status !== "ended"
      ? {
          label: raid.status === "lobby" ? "รอเริ่ม" : "กำลังสู้",
          cls: "text-warn",
        }
      : raid.result === "win"
        ? { label: "ชนะ", cls: "text-good" }
        : raid.result === "lose"
          ? { label: "แพ้", cls: "text-red" }
          : { label: "จบ", cls: "text-text3" };
  const pct = accuracyPct(raid.correct, raid.answers);

  return (
    <Row
      icon={<Swords className="h-4 w-4" />}
      title="Boss Raid"
      time={timeFmt.format(new Date(raid.at))}
    >
      <div className="flex items-center gap-2">
        <span className={`font-bold ${outcome.cls}`}>{outcome.label}</span>
        {notStarted ? null : raid.joined ? (
          <span className="text-text2">
            ตอบถูก {raid.correct}/{raid.answers}
            {pct !== null && ` (${pct}%)`}
          </span>
        ) : (
          <span className="text-text3">ไม่ได้เข้าร่วม</span>
        )}
      </div>
      {raid.reward && (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-amber/10 px-2 py-1">
          <div className="relative h-7 w-7 shrink-0">
            <Image
              src={getPetImagePath(raid.reward.sprite_prefix, 1, null, null)}
              alt={raid.reward.egg_name_th}
              fill
              sizes="28px"
              className="object-contain"
            />
          </div>
          <span className="font-bold text-gold-hi">
            ได้ไข่ {raid.reward.egg_name_th} · อันดับ {raid.reward.rank}
          </span>
        </div>
      )}
    </Row>
  );
}

function FocusRow({ focus }: { focus: MyFocus }) {
  const mine = Math.round(focus.focused_seconds / 60);
  return (
    <Row
      icon={<Timer className="h-4 w-4" />}
      title={
        focus.running
          ? "คาบตั้งใจ · กำลังดำเนิน"
          : `คาบตั้งใจ ${focus.minutes} นาที`
      }
      time={timeFmt.format(new Date(focus.at))}
    >
      {focus.joined ? (
        <span className="text-text2">
          ตั้งใจได้ {mine} นาที
          {focus.exp > 0 && (
            <span className="ml-1.5 font-bold text-gold-hi">
              +{focus.exp} EXP
            </span>
          )}
        </span>
      ) : (
        <span className="text-text3">ไม่ได้เข้าร่วม</span>
      )}
    </Row>
  );
}
