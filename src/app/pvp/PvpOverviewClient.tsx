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
          ยกที่ {m.currentRound} · เลือด {m.hpMine} — {m.hpOpp}
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

      {/* ตั๋ว + ปุ่มท้า + คำอธิบายรางวัล */}
      <div className="mt-3 rounded-2xl border border-gold-dim bg-card p-4">
        <p className="text-sm text-text2">
          <span className="font-bold text-text">ตั๋วประลอง {overview.ticketBalance} ใบ</span>
          <span className="text-text3"> · เติมวันละ 2 ใบ + ได้เพิ่มจากท้าทาย (ชนะหรือแพ้ก็ได้)</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text3">
          ชนะ = EXP เต็มก้อน · สู้จนจบ = ได้ EXP ติดมือ · ทั้งหมดนี้ไม่กินโควตา EXP ต่อวัน
        </p>
        <Link
          href="/pvp/new"
          className={`mt-3 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold active:scale-[0.98] ${
            overview.ticketBalance > 0
              ? "border-gold bg-amber text-track"
              : "pointer-events-none border-border bg-track text-text3 opacity-60"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M14.5 3.5 20.5 9.5M4 20l3.5-1 10-10-2.5-2.5-10 10L4 20Zm11-13 2-2 2 2-2 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          ท้าเพื่อนประลอง
        </Link>
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
