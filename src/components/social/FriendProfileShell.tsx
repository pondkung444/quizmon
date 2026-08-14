"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { resolvePetDisplay } from "@/components/social/petSummary";
import ConfirmActionModal from "@/components/social/ConfirmActionModal";
import { removeFriend, blockUser } from "@/app/social/actions";
import type { FriendListItem } from "@/lib/friends";

// S05 shell เท่านั้น (เฟส 4) — แค่รูป Qmon ที่ภูมิใจ + ชื่อ + ปุ่มย้อนกลับ + เมนู ⋯ (ลบเพื่อน/บล็อก)
// เนื้อหาเต็ม (โรงเรียน/ระดับชั้น/สถิติ/เหรียญ) มาเฟส 6 บน route เดิมนี้ ไม่สร้าง route ใหม่
export default function FriendProfileShell({ friend }: { friend: FriendListItem }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"remove" | "block" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { imagePath, speciesName } = friend.pet
    ? resolvePetDisplay(friend.pet)
    : { imagePath: null, speciesName: "" };

  function handleConfirm() {
    if (!confirmAction || isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        if (confirmAction === "remove") {
          await removeFriend(friend.friendUserId);
        } else {
          await blockUser(friend.friendUserId);
        }
        router.push("/social?tab=friends");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href="/social?tab=friends"
          className="flex items-center gap-1 text-sm text-text3 transition hover:text-gold-hi"
        >
          <ArrowLeft className="h-4 w-4" /> กลับ
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="ตัวเลือกเพิ่มเติม"
            className="flex h-11 w-11 items-center justify-center rounded-full text-text3 transition active:scale-95"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-xl border border-gold-dim bg-card shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmAction("remove");
                  }}
                  className="block min-h-11 w-full px-4 py-3 text-left text-sm font-medium text-text transition hover:bg-track"
                >
                  ลบเพื่อน
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmAction("block");
                  }}
                  className="block min-h-11 w-full px-4 py-3 text-left text-sm font-medium text-red transition hover:bg-track"
                >
                  บล็อกผู้เล่น
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pt-8 text-center">
        <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-track">
          {imagePath && (
            <Image src={imagePath} alt={speciesName} width={110} height={110} className="h-28 w-28 object-contain" />
          )}
        </div>
        <h1 className="text-xl font-bold text-gold-hi">{friend.username}</h1>
      </div>

      {confirmAction && (
        <ConfirmActionModal
          title={confirmAction === "remove" ? "ลบเพื่อนคนนี้?" : "บล็อกผู้เล่นคนนี้?"}
          description={
            confirmAction === "remove"
              ? `${friend.username} จะหายจากรายชื่อเพื่อนของคุณ`
              : `${friend.username} จะถูกลบออกจากเพื่อน ถูกใจและกำลังใจระหว่างกันจะหายไปด้วย และจะติดต่อคุณผ่าน Friend Code ไม่ได้อีก`
          }
          confirmLabel={confirmAction === "remove" ? "ลบเพื่อน" : "บล็อก"}
          isPending={isPending}
          errorMessage={errorMessage}
          danger={confirmAction === "block"}
          onConfirm={handleConfirm}
          onCancel={() => {
            setConfirmAction(null);
            setErrorMessage(null);
          }}
        />
      )}
    </div>
  );
}
