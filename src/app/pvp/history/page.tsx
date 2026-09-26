import Link from "next/link";
import { redirect } from "next/navigation";
import AppThemeMarker from "@/components/AppThemeMarker";
import { createClient } from "@/lib/supabase/server";
import { requirePvpAccess } from "@/lib/pvp";
import { getPvpHistorySummary, historyPage, HISTORY_PAGE_SIZE } from "@/lib/pvp/history";
import { RecordTotals, RivalLink } from "../HistorySummary";

export const dynamic = "force-dynamic";

export default async function PvpHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await requirePvpAccess();
  if (user.isAnonymous) redirect("/pvp");
  const summary = await getPvpHistorySummary(await createClient(), user.id);
  const page = Math.min(historyPage((await searchParams).page), Math.max(1, Math.ceil(summary.rivalCount / HISTORY_PAGE_SIZE)));
  const rivals = summary.rivals.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
  return <><AppThemeMarker /><main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
    <Link href="/pvp" className="inline-flex min-h-11 items-center text-sm font-bold text-gold-hi">← กลับหน้าประลอง</Link>
    <h1 className="mt-3 text-2xl font-extrabold text-text">สถิติการประลอง</h1>
    <p className="mt-1 text-sm text-text2">กดชื่อคู่ต่อสู้เพื่อดูสถิติที่เล่นด้วยกัน</p>
    <div className="mt-5 rounded-2xl border border-border bg-card p-4"><RecordTotals record={summary.totals} /></div>
    <h2 className="mt-6 text-base font-bold text-text">คู่ต่อสู้ทั้งหมด · {summary.rivalCount} คน</h2>
    <div className="mt-3 space-y-3">{rivals.map(r => <RivalLink key={r.opponentId} rival={r} />)}</div>
    {!summary.rivalCount && <p className="mt-4 text-sm text-text2">ยังไม่มีประวัติประลองที่จบแล้ว</p>}
    <nav aria-label="หน้ารายชื่อคู่ต่อสู้" className="mt-5 flex items-center justify-between gap-3 text-sm font-bold text-gold-hi">
      {page > 1 ? <Link className="flex min-h-11 items-center" href={`/pvp/history?page=${page - 1}`}>← ก่อนหน้า</Link> : <span />}
      <span className="text-xs text-text3">หน้า {page}</span>
      {page * HISTORY_PAGE_SIZE < summary.rivalCount ? <Link className="flex min-h-11 items-center" href={`/pvp/history?page=${page + 1}`}>ถัดไป →</Link> : <span />}
    </nav>
  </main></>;
}
