import Link from "next/link";
import { completedCount, type PvpHistorySummary, type PvpRecord, type RivalRecord } from "@/lib/pvp/historyStats";

export function RecordTotals({ record }: { record: PvpRecord }) {
  const completed = completedCount(record);
  const rate = completed ? Math.round(record.wins / completed * 100) : null;
  return <div>
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-sm text-text2">จบแล้ว <strong className="text-text">{completed}</strong> นัด</p>
      <p className="text-sm text-text2">ชนะ <strong className="text-gold-hi">{rate === null ? "—" : `${rate}%`}</strong></p>
    </div>
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-correct/10 py-3"><dt className="text-xs font-bold text-correct-hi">ชนะ</dt><dd className="mt-1 text-2xl font-extrabold text-correct-hi">{record.wins}</dd></div>
      <div className="rounded-xl bg-red/10 py-3"><dt className="text-xs font-bold text-text2">แพ้</dt><dd className="mt-1 text-2xl font-extrabold text-text">{record.losses}</dd></div>
      <div className="rounded-xl bg-track py-3"><dt className="text-xs font-bold text-text2">เสมอ</dt><dd className="mt-1 text-2xl font-extrabold text-text">{record.draws}</dd></div>
    </dl>
    {record.abandoned > 0 && <p className="mt-3 text-xs text-text3">เล่นไม่จบ {record.abandoned} นัด · ไม่นับในอัตราชนะ</p>}
  </div>;
}

export function RivalLink({ rival }: { rival: RivalRecord }) {
  return <Link href={`/pvp/history/${rival.opponentId}`} className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-track/40 p-3 transition hover:border-gold-dim focus-visible:outline-2 focus-visible:outline-gold">
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo/20 text-lg font-extrabold text-indigo-hi">{Array.from(rival.opponentName)[0]}</span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-extrabold text-text">{rival.opponentName}</p>
      <p className="mt-1 text-xs text-text2">ชนะ {rival.wins} · แพ้ {rival.losses} · เสมอ {rival.draws}</p>
      {rival.abandoned > 0 && <p className="mt-0.5 text-xs text-text3">เล่นไม่จบ {rival.abandoned} นัด</p>}
    </div>
    <span className="shrink-0 text-xs font-bold text-gold-hi">ดูสถิติ →</span>
  </Link>;
}

export default function HistorySummary({ summary }: { summary: PvpHistorySummary }) {
  return <section className="mt-8 rounded-2xl border border-border bg-card p-4" aria-label="สรุปสถิติประลอง">
    <h2 className="text-lg font-extrabold text-text">สถิติการประลอง</h2>
    <p className="mb-4 mt-1 text-xs text-text3">ผลงานทั้งหมดของคุณ</p>
    <RecordTotals record={summary.totals} />
    {summary.rivalCount > 0 ? <>
      <h3 className="mb-2 mt-5 text-sm font-bold text-text2">คู่ต่อสู้ล่าสุด</h3>
      <div className="space-y-2">{summary.rivals.slice(0, 3).map(r => <RivalLink key={r.opponentId} rival={r} />)}</div>
      <Link href="/pvp/history" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-border text-sm font-bold text-gold-hi">ดูคู่ต่อสู้ทั้งหมด ({summary.rivalCount}) →</Link>
    </> : <p className="mt-4 text-center text-sm text-text3">เมื่อประลองจบ สถิติของคุณจะอยู่ที่นี่</p>}
  </section>;
}
