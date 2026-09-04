"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { PvpOverview, PvpMatchListItem } from "@/lib/pvp";
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

export default function PvpOverviewClient({ overview }: { overview: PvpOverview }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const respond = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "ทำรายการไม่สำเร็จ");
      else router.refresh();
    });
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-gold-hi">ประลอง</h1>

      {/* ตั๋ว + รางวัล + ปุ่มท้า */}
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

        {/* รางวัล EXP */}
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <p className="flex items-center gap-2">
            <span>🏆</span>
            <span className="font-extrabold text-gold-hi">ชนะ</span>
            <span className="text-text2">— รับ EXP เต็มก้อน</span>
          </p>
          <p className="flex items-center gap-2">
            <span>🔥</span>
            <span className="font-extrabold text-amber">สู้จนจบ</span>
            <span className="text-text2">— ยังได้ EXP ติดมือกลับไป</span>
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo/15 px-2.5 py-1 text-xs font-bold text-indigo-hi">
            ✨ ไม่กินโควตา EXP รายวัน
          </span>
        </div>

        {/* ปุ่มท้า */}
        <Link
          href="/pvp/new"
          className={`mt-4 flex items-center justify-center gap-2 rounded-xl border py-3 text-base font-extrabold active:scale-[0.98] ${
            overview.ticketBalance > 0
              ? "border-gold bg-amber text-track shadow-md"
              : "pointer-events-none border-border bg-track text-text3 opacity-60"
          }`}
        >
          <span>⚔️</span>
          ท้าเพื่อนประลอง
        </Link>
        {overview.ticketBalance <= 0 && (
          <p className="mt-2 text-center text-[11px] text-text3">
            ตั๋วหมด — พรุ่งนี้ได้อีก 2 หรือไปเล่นท้าทายให้จบ
          </p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red">{error}</p>}

      {/* ถึงตาคุณ — ขึ้นก่อนเสมอ */}
      <section className="mt-6">
        <h2 className="text-sm font-bold text-text2">ถึงตาคุณ</h2>
        <div className="mt-2 space-y-2">
          {overview.yourTurn.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-xs text-text3">
              ยังไม่มีตาที่ต้องเล่น
            </p>
          )}
          {overview.yourTurn.map((m) => (
            <MatchRow key={m.id} m={m} />
          ))}
        </div>
      </section>

      {/* คำท้าที่ถูกท้า */}
      {overview.incoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-text2">คำท้าใหม่</h2>
          <div className="mt-2 space-y-2">
            {overview.incoming.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-gold-dim bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {c.challengerPet && (
                    <Image
                      src={c.challengerPet.imagePath}
                      alt=""
                      width={40}
                      height={40}
                      className="rounded-lg bg-track"
                      unoptimized
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-bold text-text">{c.challengerName} ท้าประลอง</p>
                    {c.challengerPet && (
                      <p className="text-xs text-text3">ส่ง {c.challengerPet.speciesName} ลงสนาม</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/pvp/challenge/${c.id}`}
                    className="flex-1 rounded-lg border border-gold bg-amber px-3 py-2 text-center text-sm font-bold text-track active:scale-95"
                  >
                    รับคำท้า
                  </Link>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => respond(() => declinePvpChallenge(c.id))}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-text2 active:scale-95 disabled:opacity-50"
                  >
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* รอเพื่อนตอบ / คำท้าที่ส่งไป */}
      {(overview.waiting.length > 0 || overview.outgoing.length > 0) && (
        <section className="mt-6">
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
                    {c.status === "declined" ? "ปฏิเสธคำท้าแล้ว" : "รอตอบรับคำท้า"}
                  </p>
                </div>
                {c.status === "pending" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => respond(() => cancelPvpChallenge(c.id))}
                    className="text-xs text-text3 underline active:scale-95 disabled:opacity-50"
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
