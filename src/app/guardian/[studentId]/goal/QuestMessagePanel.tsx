"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { guardianSetQuestMessage } from "@/app/guardian/actions";

export type QuestMessageOptions = {
  currentMessageId: number | null;
  messages: { id: number; text: string }[];
};

// เลือกข้อความ preset ที่จะแสดงคู่กับโจทย์ที่มาจากแผน — ห้ามพิมพ์เอง (§7.5)
// ห้ามมีสถิติ/จำนวนข้อ/ข้อไหนถูกแสดงให้เด็ก (§10.2)
export default function QuestMessagePanel({
  studentId,
  options,
}: {
  studentId: string;
  options: QuestMessageOptions;
}) {
  const [currentId, setCurrentId] = useState<number | null>(options.currentMessageId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(messageId: number | null) {
    if (submitting || messageId === currentId) return;
    setSubmitting(true);
    setError(null);
    const { error } = await guardianSetQuestMessage(studentId, messageId);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    setCurrentId(messageId);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-base font-semibold text-text2">ข้อความถึงลูก</p>
        <p className="mt-0.5 text-sm text-text3">
          ข้อความนี้จะแสดงคู่กับโจทย์ที่มาจากแผน (ไม่เกิน 2 ข้อต่อวัน)
        </p>
      </div>

      {error && <p className="rounded-xl bg-red/10 p-3 text-center text-base text-red">{error}</p>}

      {options.messages.map(({ id, text }) => {
        const isSelected = currentId === id;
        return (
          <button
            key={id}
            type="button"
            disabled={submitting}
            onClick={() => handleSelect(id)}
            className={`flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border-2 px-5 py-3 text-left transition active:scale-[0.98] disabled:opacity-50 ${
              isSelected ? "border-gold-hi bg-gold-hi/10" : "border-border bg-card hover:border-gold-dim"
            }`}
          >
            <p className={`text-base font-semibold ${isSelected ? "text-gold-hi" : "text-text"}`}>{text}</p>
            {isSelected && <Check className="h-6 w-6 flex-none text-gold-hi" />}
          </button>
        );
      })}

      <button
        type="button"
        disabled={submitting || currentId === null}
        onClick={() => handleSelect(null)}
        className="min-h-[48px] rounded-2xl border-2 border-border bg-card px-5 py-3 text-base font-semibold text-text2 transition active:scale-[0.98] disabled:opacity-50"
      >
        ไม่ส่งข้อความ
      </button>
    </div>
  );
}
