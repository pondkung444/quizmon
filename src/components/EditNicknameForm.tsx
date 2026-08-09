"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPetNickname } from "@/app/pet/actions";
import { isBlockedNickname } from "@/lib/moderation/nicknameBlocklist";

const NICKNAME_MAX_LENGTH = 20;

export default function EditNicknameForm({ petId, currentNickname }: { petId: string; currentNickname: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nickname, setNickname] = useState(currentNickname);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmed = nickname.trim();
  const clientError =
    trimmed.length > 0 && isBlockedNickname(trimmed) ? "ชื่อนี้ใช้ไม่ได้ ลองชื่ออื่นนะ" : null;
  const canSave = trimmed.length > 0 && trimmed.length <= NICKNAME_MAX_LENGTH && !clientError && !isPending;

  function handleSave() {
    if (!canSave) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await setPetNickname(petId, trimmed);
        router.push(`/collection/${petId}`);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "บันทึกชื่อไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      }
    });
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, NICKNAME_MAX_LENGTH))}
          maxLength={NICKNAME_MAX_LENGTH}
          placeholder="ตั้งชื่อ Qmon"
          className="w-full rounded-xl border border-gold-dim bg-track px-4 py-3 text-center text-lg font-bold text-text outline-none focus:border-gold"
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
        disabled={!canSave}
        onClick={handleSave}
        className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {isPending ? "กำลังบันทึก..." : "บันทึกชื่อ"}
      </button>
    </div>
  );
}
