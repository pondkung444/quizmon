import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppThemeMarker from "@/components/AppThemeMarker";
import { requirePvpAccess } from "@/lib/pvp";
import { createClient } from "@/lib/supabase/server";
import { getPvpHistorySummary, getPvpRivalMatches, historyPage, HISTORY_PAGE_SIZE } from "@/lib/pvp/history";
import { matchResult } from "@/lib/pvp/historyStats";
import { RecordTotals } from "../../HistorySummary";

export const dynamic = "force-dynamic";
const labels = { wins: "ชนะ", losses: "แพ้", draws: "เสมอ", abandoned: "เล่นไม่จบ" };
const colors = { wins: "bg-correct/15 text-correct-hi", losses: "bg-red/15 text-text", draws: "bg-indigo/15 text-indigo-hi", abandoned: "bg-track text-text3" };
const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function RivalHistoryPage({ params, searchParams }: {
  params: Promise<{ opponentId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requirePvpAccess();
  if (user.isAnonymous) redirect("/pvp");
  const { opponentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opponentId) || opponentId === user.id) notFound();
  const page = historyPage((await searchParams).page);
  const supabase = await createClient();
  const [summary, history] = await Promise.all([
    getPvpHistorySummary(supabase, user.id, opponentId),
    getPvpRivalMatches(supabase, user.id, opponentId, page),
  ]);
  const rival = summary.rivals[0];
  if (!rival) notFound();
  const lastPage = Math.max(1, Math.ceil(history.count / HISTORY_PAGE_SIZE));
  if (page > lastPage) redirect(`/pvp/history/${opponentId}?page=${lastPage}`);
  return <><AppThemeMarker /><main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
    <Link href="/pvp/history" className="inline-flex min-h-11 items-center text-sm font-bold text-gold-hi">← คู่ต่อสู้ทั้งหมด</Link>
    <p className="mt-4 text-sm text-text2">สถิติของคุณเมื่อเจอกับ</p>
    <h1 className="mt-1 break-words text-2xl font-extrabold text-gold-hi">{rival.opponentName}</h1>
    <div className="mt-5 rounded-2xl border border-gold-dim bg-card p-4"><RecordTotals record={rival} /></div>
    <h2 className="mt-6 text-lg font-bold text-text">ประวัติที่เล่นด้วยกัน</h2>
    <p className="mt-1 text-xs text-text3">เรียงล่าสุดก่อน · แตะแมตช์เพื่อดูผลการประลอง</p>
    <div className="mt-3 space-y-2">{history.matches.map(m => {
      const result = matchResult(m, user.id);
      const isA = m.player_a_id === user.id;
      return <Link key={m.id} href={`/pvp/${m.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-gold-dim">
        <span className={`min-w-16 rounded-lg px-2 py-2 text-center text-xs font-extrabold ${result ? colors[result] : "text-text3"}`}>{result ? labels[result] : "ไม่มีผล"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text">{dateFormat.format(new Date(m.last_action_at))}</p>
          <p className="mt-1 text-xs text-text3">ยกที่ {m.current_round} · HP คุณ {Math.max(0, isA ? m.hp_a : m.hp_b)} / คู่ต่อสู้ {Math.max(0, isA ? m.hp_b : m.hp_a)}</p>
        </div>
        <span aria-hidden="true" className="text-gold-hi">→</span>
      </Link>;
    })}</div>
    <nav aria-label="หน้าประวัติประลอง" className="mt-5 flex items-center justify-between gap-3 text-sm font-bold text-gold-hi">
      {page > 1 ? <Link className="flex min-h-11 items-center" href={`/pvp/history/${opponentId}?page=${page - 1}`}>← ก่อนหน้า</Link> : <span />}
      <span className="text-xs text-text3">หน้า {page} / {lastPage}</span>
      {page < lastPage ? <Link className="flex min-h-11 items-center" href={`/pvp/history/${opponentId}?page=${page + 1}`}>ถัดไป →</Link> : <span />}
    </nav>
  </main></>;
}
