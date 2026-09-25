import Link from "next/link";
import { Users } from "lucide-react";
import { CHIP_CLASS, formatSessionTime, sessionChips, type SessionSummary } from "@/lib/classroom/dashboard";

// แถวคาบ 1 แถว: เวลา · ชื่อห้อง · ชิปผลกิจกรรม · จำนวนคน (หน้าแรกครู + หน้าห้อง)
export default function SessionRow({
  s,
  now,
  showTitle = true,
}: {
  s: SessionSummary;
  now: Date;
  showTitle?: boolean;
}) {
  const chips = sessionChips(s);
  const open = s.status !== "ended";
  const href = open ? `/teacher/${s.id}` : showTitle && s.class_id ? `/teacher/classes/${s.class_id}` : null;
  const body = (
    <>
      <span className="w-28 shrink-0 text-xs text-text3">{formatSessionTime(s.created_at, now)}</span>
      {showTitle && (
        <span className="w-32 shrink-0 truncate font-bold text-text">{s.title ?? "ห้องไม่มีชื่อ"}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {open && <span className="rounded-full bg-good/15 px-2.5 py-0.5 text-xs text-good">เปิดอยู่</span>}
        {chips.length === 0 && !open && <span className="text-xs text-text3">ไม่ได้เล่นกิจกรรม</span>}
        {chips.map((chip, i) => (
          <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs ${CHIP_CLASS[chip.tone]}`}>
            {chip.label}
          </span>
        ))}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm text-text3">
        <Users className="h-4 w-4" /> {s.participants}
      </span>
    </>
  );
  const cls = "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap";
  return (
    <li>
      {href ? (
        <Link href={href} className={`${cls} transition hover:bg-track/40`}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
