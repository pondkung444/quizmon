"use client";

import { useState } from "react";
import Image from "next/image";
import { isBlockedNickname } from "@/lib/moderation/nicknameBlocklist";

const NICKNAME_MAX_LENGTH = 20;

export default function HatchNamingModal({
  eggNameTh,
  eggImagePath,
  isPending,
  errorMessage,
  onConfirm,
}: {
  eggNameTh: string;
  eggImagePath: string | null;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (nickname: string) => void;
}) {
  const [nickname, setNickname] = useState("");

  const trimmed = nickname.trim();
  // เช็ค client-side เพื่อ feedback ทันที — server (hatchEgg) ยัง validate ซ้ำเสมอ ห้ามเชื่อฝั่งนี้อย่างเดียว
  const clientError =
    trimmed.length > 0 && isBlockedNickname(trimmed) ? "ชื่อนี้ใช้ไม่ได้ ลองชื่ออื่นนะ" : null;
  const canConfirm = trimmed.length > 0 && trimmed.length <= NICKNAME_MAX_LENGTH && !clientError && !isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {eggImagePath && (
            <Image src={eggImagePath} alt={eggNameTh} width={64} height={64} className="shrink-0" />
          )}
          <h2 className="text-lg font-bold text-gold-hi">ตั้งชื่อ Qmon ของเธอ</h2>
          <p className="text-sm text-text3">{eggNameTh} — ตั้งชื่อก่อนถึงจะฟักได้</p>
        </div>

        <div className="flex flex-col gap-1">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, NICKNAME_MAX_LENGTH))}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder="ตั้งชื่อ Qmon"
            autoFocus
            className="font-sarabun w-full rounded-xl border border-gold-dim bg-track px-4 py-3 text-center text-lg font-bold text-text outline-none focus:border-gold"
          />
          <p className="text-right text-xs text-text3">
            {trimmed.length}/{NICKNAME_MAX_LENGTH}
          </p>
        </div>

        {(clientError || errorMessage) && (
          <p className="text-center text-sm text-red">{clientError ?? errorMessage}</p>
        )}

        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => canConfirm && onConfirm(trimmed)}
          className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "กำลังฟัก..." : "ฟักไข่"}
        </button>
      </div>
    </div>
  );
}
