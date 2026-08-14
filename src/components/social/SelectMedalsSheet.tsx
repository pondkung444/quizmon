"use client";

import { useState, useTransition } from "react";
import AchievementCard, { type AchievementCardData } from "@/components/AchievementCard";
import BottomSheet from "@/components/social/BottomSheet";
import { setPinnedMedals } from "@/app/social/actions";

const MAX_MEDALS = 3;

// B03 — reuse AchievementCard ตรงๆ ตามที่ระบุไว้ (§3.1) ห่อด้วยปุ่มเลือก + badge ติ๊กมุมขวาบนเอง
// เพราะตัว AchievementCard เองไม่มี selection state ในตัว — list เฉพาะเหรียญที่ปลดล็อกแล้วเท่านั้น
export default function SelectMedalsSheet({
  earnedAchievements,
  currentPinnedIds,
  onSaved,
  onClose,
}: {
  earnedAchievements: AchievementCardData[];
  currentPinnedIds: string[];
  onSaved: (pinnedAchievementIds: string[]) => void;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(currentPinnedIds);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggle(achievementId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(achievementId)) return prev.filter((id) => id !== achievementId);
      if (prev.length >= MAX_MEDALS) return prev;
      return [...prev, achievementId];
    });
  }

  function handleSave() {
    if (isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await setPinnedMedals(selectedIds);
        onSaved(result.pinnedAchievementIds);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "บันทึกเหรียญที่ปักหมุดไม่สำเร็จ");
      }
    });
  }

  return (
    <BottomSheet title={`เลือกเหรียญแห่งความภูมิใจ (${selectedIds.length}/${MAX_MEDALS})`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {earnedAchievements.length === 0 && (
          <p className="p-4 text-center text-sm text-text3">ยังไม่มีเหรียญที่ปลดล็อกเลย</p>
        )}
        {earnedAchievements.map((achievement) => {
          const isSelected = selectedIds.includes(achievement.id);
          const isLocked = !isSelected && selectedIds.length >= MAX_MEDALS;
          return (
            <button
              key={achievement.id}
              type="button"
              disabled={isLocked}
              aria-pressed={isSelected}
              onClick={() => toggle(achievement.id)}
              className={`relative rounded-2xl text-left transition disabled:opacity-40 ${
                isSelected ? "ring-2 ring-gold" : ""
              }`}
            >
              <AchievementCard data={achievement} />
              <span
                className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  isSelected ? "border-gold bg-amber text-track" : "border-gold-dim bg-card text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>

      {errorMessage && <p className="mt-3 text-center text-sm text-red">{errorMessage}</p>}

      <button
        type="button"
        disabled={isPending}
        onClick={handleSave}
        className="mt-4 w-full rounded-2xl border border-gold bg-amber py-3 text-base font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {isPending ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </BottomSheet>
  );
}
