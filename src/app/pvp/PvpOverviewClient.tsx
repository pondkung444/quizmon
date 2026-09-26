"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { track } from "@/lib/analytics";
import { usePvpResync } from "@/lib/pvp/usePvpResync";
import PvpExpectations from "./PvpExpectations";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { PvpOverview, PvpMatchListItem, PvpOpenChallenge } from "@/lib/pvp";
import { declinePvpChallenge, cancelPvpChallenge } from "./actions";

function MatchRow({ m }: { m: PvpMatchListItem }) {
  const label =
    m.status === "abandoned"
      ? "ถูกทิ้ง (หมดเวลา)"
      : m.status === "finished"
        ? m.iWon === null
          ? "เสมอ"
          : m.iWon
            ? "ดวลมันส์มาก! ชนะไปแล้ว"
            : "สู้ดีมากจนนาทีสุดท้าย"
        : m.myTurn
          ? "ถึงตาคุณ"
          : "รอเพื่อนตอบ";
  return (
    <Link
      href={`/pvp/${m.id}`}
      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:border-gold-dim"
    >
      <div>
        <p className="text-sm font-bold text-text">{m.opponentName}</p>
        <p className="text-xs text-text3">
          ยกที่ {m.currentRound} · เลือด {Math.max(0, m.hpMine)} — {Math.max(0, m.hpOpp)}
        </p>
      </div>
      <span
        className={`text-xs font-bold ${
          m.status === "active" && m.myTurn ? "text-gold-hi" : "text-text3"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

function TurnCard({ m }: { m: PvpMatchListItem }) {
  const nextStep = m.phase === "assigning"
    ? "เลือกการ์ดส่งให้คู่ต่อสู้"
    : m.phase === "card_ready"
      ? "คู่ต่อสู้ส่งการ์ดมาแล้ว รอคุณเริ่มตอบ"
      : "คำถามเริ่มแล้ว กลับไปตอบต่อ";
  return <div className="rounded-2xl border-2 border-gold bg-amber/10 p-4 shadow-[0_0_24px_rgba(255,180,63,0.14)]">
    <div className="flex items-center gap-4">
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-track/80">
        {m.opponentPetImage
          ? <Image src={m.opponentPetImage} alt={m.opponentPetName} fill unoptimized className="object-contain p-2" />
          : <span className="text-4xl" aria-hidden="true">⚔️</span>}
      </div>
      <div className="min-w-0">
        <span className="inline-flex rounded-full bg-amber px-2.5 py-1 text-xs font-extrabold text-on-amber">ถึงตาคุณแล้ว</span>
        <h3 className="mt-2 text-lg font-extrabold text-text">ประลองกับ {m.opponentName}</h3>
        <p className="mt-1 text-sm text-text2">{m.opponentPetName} · ยกที่ {m.currentRound}</p>
      </div>
    </div>
    <p className="mt-3 text-sm font-bold text-gold-hi">{nextStep}</p>
    <Link href={`/pvp/${m.id}`} className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-amber px-4 text-base font-extrabold text-on-amber shadow-md active:scale-[0.98]">
      เข้าเล่นต่อ →
    </Link>
  </div>;
}

function OpenChallengeBoard({ challenges }: { challenges: PvpOpenChallenge[] }) {
  return <section className="mt-6" aria-label="กระดานคำท้าเปิด">
    <h2 className="text-lg font-extrabold text-text">รับคำท้าจากผู้เล่นคนอื่น</h2>
    <p className="mt-1 text-sm text-text2">เลือก Qmon ที่อยากสู้ แล้วกดรับคำท้าเพื่อเริ่มประลอง</p>
    {challenges.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-gold-dim bg-card px-4 py-4 text-center">
      <p className="text-sm font-bold text-text2">ตอนนี้ยังไม่มีใครเปิดคำท้า</p>
      <p className="mt-1 text-xs text-text3">เปิดคำท้าของคุณไว้ให้คนอื่นมากดรับได้</p>
    </div> : <div className="mt-3 space-y-3">{challenges.map((c) => <div key={c.id} className="rounded-2xl border border-gold-dim bg-card p-4">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 rounded-2xl bg-track/80">
          <Image src={c.imagePath} alt={c.petName} fill unoptimized className="object-contain p-2" />
        </div>
        <div className="min-w-0">
          <span className="text-xs font-extrabold text-gold-hi">พร้อมให้รับคำท้า</span>
          <h3 className="mt-1 text-base font-extrabold text-text">{c.petName}</h3>
          <p className="mt-1 text-xs text-text3">ผู้เล่นระดับเดียวกับคุณ</p>
        </div>
      </div>
      <Link href={`/pvp/open/${c.id}`} className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-amber px-4 text-base font-extrabold text-on-amber active:scale-[0.98]">รับคำท้า →</Link>
    </div>)}</div>}
  </section>;
}

export default function PvpOverviewClient({ overview }: { overview: PvpOverview }) {
  const hasPendingOpen = overview.outgoing.some((c) => c.isOpen && c.status === "pending");
  useEffect(() => { track("pvp_open_board_view", { open_count: overview.openChallenges.length }); }, [overview.openChallenges.length]);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const refresh = useCallback(() => { if (!actionLock.current) router.refresh(); }, [router]);
  usePvpResync(refresh);

  const respond = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.message ?? "ทำรายการไม่สำเร็จ");
        else router.refresh();
      } catch { setError("เชื่อมต่อไม่สำเร็จ ตรวจสถานะอีกครั้งก่อนลองใหม่"); }
      finally { actionLock.current = false; }
    });
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-gold-hi">ประลอง</h1>
      {(overview.yourTurn.length > 0 || overview.incoming.length > 0) && <section className="mt-5" aria-label="รายการที่รอให้คุณเล่น">
        <h2 className="text-lg font-extrabold text-text">รอให้คุณลงมือ</h2>
        <p className="mt-1 text-sm text-text2">คำท้าและแมตช์ที่พร้อมเล่นตอนนี้</p>
        <div className="mt-3 space-y-3">
          {overview.yourTurn.map(m => <TurnCard key={m.id} m={m} />)}
          {overview.incoming.map((c) => <div key={c.id} className="rounded-2xl border-2 border-gold bg-amber/10 p-4 shadow-[0_0_24px_rgba(255,180,63,0.14)]">
            <div className="flex items-center gap-4">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-track/80">
                {c.challengerPet
                  ? <Image src={c.challengerPet.imagePath} alt={c.challengerPet.speciesName} fill unoptimized className="object-contain p-2" />
                  : <span className="text-4xl" aria-hidden="true">⚔️</span>}
              </div>
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-amber px-2.5 py-1 text-xs font-extrabold text-on-amber">คำท้าใหม่</span>
                <h3 className="mt-2 text-lg font-extrabold text-text">{c.challengerName} ท้าประลอง</h3>
                {c.challengerPet && <p className="mt-1 text-sm text-text2">ส่ง {c.challengerPet.speciesName} ลงสนาม</p>}
              </div>
            </div>
            <Link href={`/pvp/challenge/${c.id}`} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-amber px-4 text-base font-extrabold text-on-amber shadow-md active:scale-[0.98]">ดูและรับคำท้า →</Link>
            <button type="button" disabled={pending} onClick={() => respond(() => declinePvpChallenge(c.id))}
              className="mt-2 min-h-11 w-full rounded-xl border border-border text-sm font-bold text-text2 active:scale-[0.98] disabled:opacity-50">ปฏิเสธ</button>
          </div>)}
        </div>
      </section>}
      {overview.openChallenges.length > 0 && <OpenChallengeBoard challenges={overview.openChallenges} />}
      <PvpExpectations />

      {/* เลือกวิธีเริ่มประลอง */}
      <div className="mt-3 rounded-2xl border border-gold-dim bg-card p-4">
        {/* จำนวนตั๋ว */}
        <div className="flex items-baseline gap-2">
          <span className="text-xl">🎟️</span>
          <span className="text-3xl font-extrabold leading-none text-gold-hi">
            {overview.ticketBalance}
          </span>
          <span className="text-sm font-bold text-text2">ตั๋วประลอง</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-text3">
          <span className="rounded-full bg-track px-2 py-1">📅 เติมวันละ 2</span>
          <span className="rounded-full bg-track px-2 py-1">⚔️ +1 ทุกท้าทายที่จบ · ชนะ/แพ้</span>
        </div>

        <h2 className="mt-5 text-base font-extrabold text-text">อยากเริ่มประลองแบบไหน?</h2>

        <div className="mt-3 rounded-2xl border-2 border-gold bg-amber/10 p-4 shadow-[0_0_24px_rgba(255,180,63,0.12)]">
          <span className="inline-flex rounded-full bg-amber px-2.5 py-1 text-[11px] font-extrabold text-on-amber">
            ไม่มีเพื่อนก็เล่นได้
          </span>
          <h3 className="mt-3 text-lg font-extrabold text-gold-hi">เปิดคำท้า รอคู่ต่อสู้</h3>
          <p className="mt-1 text-sm leading-relaxed text-text2">
            เลือก Qmon ของคุณ แล้วให้ผู้เล่นระดับเดียวกันมากดรับคำท้า
          </p>
          {hasPendingOpen ? (
            <a href="#pvp-waiting" className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-base font-extrabold text-on-amber shadow-md">
              ดูคำท้าที่เปิดไว้ →
            </a>
          ) : (
            <Link
              href="/pvp/open/new"
              aria-disabled={overview.ticketBalance <= 0}
              tabIndex={overview.ticketBalance > 0 ? undefined : -1}
              className={`mt-4 flex min-h-12 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-base font-extrabold text-on-amber shadow-md active:scale-[0.98] ${overview.ticketBalance > 0 ? "" : "pointer-events-none opacity-50"}`}
            >
              เปิดคำท้าเลย →
            </Link>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-border bg-track/60 p-4">
          <h3 className="text-sm font-bold text-text">มีเพื่อนที่อยากชวนไหม?</h3>
          <p className="mt-1 text-xs text-text3">เลือกเพื่อนหนึ่งคน แล้วส่งคำท้าไปหาเขาโดยตรง</p>
          <Link
            href="/pvp/new"
            aria-disabled={overview.ticketBalance <= 0}
            tabIndex={overview.ticketBalance > 0 ? undefined : -1}
            className={`mt-3 flex min-h-11 items-center justify-center rounded-xl border border-gold-dim px-4 text-sm font-bold text-gold-hi active:scale-[0.98] ${overview.ticketBalance > 0 ? "" : "pointer-events-none opacity-50"}`}
          >
            ท้าเพื่อนที่รู้จัก
          </Link>
        </div>
        {overview.ticketBalance <= 0 && (
          <p className="mt-3 text-center text-xs text-text2">
            ตั๋วหมด — พรุ่งนี้ได้อีก 2 หรือไปเล่นท้าทายให้จบ
          </p>
        )}

        <details className="mt-4 border-t border-border pt-3 text-xs text-text3">
          <summary className="cursor-pointer font-bold text-text2">ดูรางวัลจากการประลอง</summary>
          <div className="mt-2 space-y-1">
            <p>🏆 ชนะ รับ EXP เต็มก้อน</p>
            <p>🔥 สู้จนจบก็ได้ EXP และไม่กินโควตารายวัน</p>
          </div>
        </details>
      </div>

      {overview.openChallenges.length === 0 && <OpenChallengeBoard challenges={overview.openChallenges} />}

      {error && <p className="mt-4 text-sm text-red">{error}</p>}

      {/* รอเพื่อนตอบ / คำท้าที่ส่งไป */}
      {(overview.waiting.length > 0 || overview.outgoing.length > 0) && (
        <section id="pvp-waiting" className="mt-6">
          <h2 className="text-sm font-bold text-text2">กำลังรอ</h2>
          <div className="mt-2 space-y-2">
            {overview.waiting.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
            {overview.outgoing.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-text">{c.opponentName}</p>
                  <p className="text-xs text-text3">
                    {c.status === "declined" ? "ปฏิเสธคำท้าแล้ว" : c.isOpen ? "รอคนกดรับ · หมดอายุใน 24 ชั่วโมง" : "รอตอบรับคำท้า"}
                  </p>
                </div>
                {c.status === "pending" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => respond(() => cancelPvpChallenge(c.id))}
                    className="min-h-11 min-w-11 px-3 text-xs text-text3 underline active:scale-95 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* จบแล้ว */}
      {overview.finished.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-text2">จบแล้ว</h2>
          <div className="mt-2 space-y-2">
            {overview.finished.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
