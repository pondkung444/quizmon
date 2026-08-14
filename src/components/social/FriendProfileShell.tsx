"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreVertical, HeartHandshake } from "lucide-react";
import { resolvePetDisplay } from "@/components/social/petSummary";
import ConfirmActionModal from "@/components/social/ConfirmActionModal";
import LikeButton from "@/components/social/LikeButton";
import JourneyStatsGrid from "@/components/social/JourneyStatsGrid";
import SendEncouragementSheet from "@/components/social/SendEncouragementSheet";
import Toast from "@/components/social/Toast";
import StatRadar from "@/components/StatRadar";
import RaidGearIcon from "@/components/raid/RaidGearIcon";
import { RAID_GEAR_SLOT_ANATOMY_TH, RAID_GEAR_QUALITY_COLOR } from "@/lib/raid/labels";
import { removeFriend, blockUser } from "@/app/social/actions";
import type { FriendProfileResult } from "@/lib/friendProfile";

// สีขอบตามระดับเหรียญ — คัดลอกจาก MyProfileTab.tsx (ตั้งใจไม่ export มาใช้ร่วม เหตุผลเดียวกับที่นั่น)
const MEDAL_TIER_BORDER: Record<string, string> = {
  Bronze: "border-[#cd7f32]/60",
  Silver: "border-[#b9c2cf]/60",
  Gold: "border-gold/70",
  Crown: "border-[#c7a6f7]/60",
};

const STAT_LABEL_TH: Record<"hp" | "atk" | "def" | "spd", string> = { hp: "HP", atk: "ATK", def: "DEF", spd: "SPD" };
const GEAR_SLOTS: Array<"head" | "body" | "feet"> = ["head", "body", "feet"];
const EMPTY_ICON_COLOR = "#3a3d47"; // --color-border

// S05 เต็มรูปแบบ (เฟส 6) — ต่างจาก S03 (โปรไฟล์ตัวเอง) ตรงที่ "เพื่อน" เห็นรายละเอียดเต็มของ Qmon
// ที่ภูมิใจ (สาย/บุคลิก/สเตตัส/อุปกรณ์) เพราะนี่เป็นที่เดียวที่เห็นข้อมูลนี้ของอีกฝ่ายได้ (ดู §4.3)
// ห้ามลดทอนแบบที่ทำกับ S03 ตอนเฟส 2 — read-only ทั้งหน้ายกเว้นปุ่มถูกใจกับเมนู ⋯ (ลบเพื่อน/บล็อก)
export default function FriendProfileShell({
  profile,
  initialAlreadySentEncouragementToday,
}: {
  profile: Extract<FriendProfileResult, { found: true }>;
  initialAlreadySentEncouragementToday: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"remove" | "block" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alreadySentToday, setAlreadySentToday] = useState(initialAlreadySentEncouragementToday);
  const [encouragementSheetOpen, setEncouragementSheetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { imagePath, speciesName } = profile.pet
    ? resolvePetDisplay(profile.pet)
    : { imagePath: null, speciesName: "" };

  const gearBySlot = new Map(profile.gear.map((g) => [g.slot, g]));
  const schoolLine = [profile.school, profile.gradeLevel].filter(Boolean).join(" · ") || "ไม่ระบุโรงเรียน";

  function handleConfirm() {
    if (!confirmAction || isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        if (confirmAction === "remove") {
          await removeFriend(profile.friendUserId);
        } else {
          await blockUser(profile.friendUserId);
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

      {/* 1. ข้อมูลผู้เล่น */}
      <div>
        <h1 className="text-xl font-bold text-gold-hi">{profile.username}</h1>
        <p className="text-xs text-text3">{schoolLine}</p>
      </div>

      {/* 2. Qmon ที่ภูมิใจเต็มรูปแบบ — สาย/บุคลิก/สเตตัส/อุปกรณ์ (ต่างจาก S03 ตรงนี้) */}
      <section className="flex flex-col gap-3 rounded-2xl border border-gold-dim bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="flex w-24 flex-none flex-col items-center gap-1 text-center">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-track">
              {imagePath && (
                <Image src={imagePath} alt={speciesName} width={80} height={80} className="h-20 w-20 object-contain" />
              )}
            </div>
            <p className="w-full truncate text-sm font-bold text-text">{profile.pet?.nickname ?? speciesName}</p>
            <p className="line-clamp-2 w-full text-center text-xs leading-tight text-text3">{speciesName}</p>
          </div>
          <div className="min-w-0 flex-1">
            <StatRadar stats={profile.stats} showValues />
          </div>
        </div>

        {gearBySlot.size > 0 && (
          <div className="flex justify-center gap-4 border-t border-gold-dim pt-3">
            {GEAR_SLOTS.map((slot) => {
              const gear = gearBySlot.get(slot);
              if (!gear) return null;
              return (
                <div key={slot} className="flex flex-col items-center gap-1">
                  <RaidGearIcon slot={slot} color={RAID_GEAR_QUALITY_COLOR[gear.quality] ?? EMPTY_ICON_COLOR} size={36} />
                  <span className="text-[10px] text-text3">{RAID_GEAR_SLOT_ANATOMY_TH[slot]}</span>
                  <span className="text-[10px] font-bold text-text2">
                    {STAT_LABEL_TH[gear.mainStat]} +{gear.mainValue}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. ปุ่มปฏิสัมพันธ์ — ถูกใจ + ส่งกำลังใจ (§11.4) */}
      <div className="flex justify-center gap-3">
        <LikeButton targetUserId={profile.friendUserId} initialLiked={profile.likedByMe} initialCount={profile.likeCount} />
        <button
          type="button"
          disabled={alreadySentToday}
          onClick={() => setEncouragementSheetOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-gold-dim px-4 text-sm font-bold text-text3 transition active:scale-95 disabled:opacity-50"
        >
          <HeartHandshake className="h-4 w-4" />
          {alreadySentToday ? "ส่งแล้ววันนี้" : "ส่งกำลังใจ"}
        </button>
      </div>

      {/* 4. เหรียญแห่งความภูมิใจ */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-gold-hi">เหรียญแห่งความภูมิใจ</h2>
        {profile.medals.length === 0 ? (
          <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
            ยังไม่ได้ปักหมุดเหรียญ
          </p>
        ) : (
          <div className="flex justify-center gap-4">
            {profile.medals.map((medal) => (
              <div key={medal.id} className="flex w-24 flex-none flex-col items-center gap-1.5">
                <div
                  className={`flex h-24 w-24 items-center justify-center rounded-2xl border-2 bg-card p-3 shadow-md ${
                    MEDAL_TIER_BORDER[medal.tier] ?? "border-gold-dim"
                  }`}
                >
                  <Image
                    src={`/achievement/${medal.imageFile}`}
                    alt={medal.name}
                    width={72}
                    height={72}
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="line-clamp-2 text-center text-xs font-bold leading-tight text-text">{medal.name}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. เส้นทางของฉัน */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-gold-hi">เส้นทางของฉัน</h2>
        <JourneyStatsGrid stats={profile.journeyStats} />
      </section>

      {/* 6. Qmon ตัวโปรด — กดไม่ได้ ไม่มีปุ่มแก้ไข (สิทธิ์เจ้าของเท่านั้น ตาม §4.6) */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-gold-hi">Qmon ตัวโปรด</h2>
        {profile.favoritePets.length === 0 ? (
          <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
            ยังไม่ได้เลือก Qmon ตัวโปรด
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {profile.favoritePets.map((pet, index) => {
              const { imagePath: favImagePath, speciesName: favSpeciesName } = resolvePetDisplay(pet);
              return (
                <div
                  key={index}
                  className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-gold bg-track p-2"
                >
                  {favImagePath && (
                    <Image src={favImagePath} alt={favSpeciesName} width={90} height={90} className="h-16 w-16 object-contain" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {confirmAction && (
        <ConfirmActionModal
          title={confirmAction === "remove" ? "ลบเพื่อนคนนี้?" : "บล็อกผู้เล่นคนนี้?"}
          description={
            confirmAction === "remove"
              ? `${profile.username} จะหายจากรายชื่อเพื่อนของคุณ`
              : `${profile.username} จะถูกลบออกจากเพื่อน ถูกใจและกำลังใจระหว่างกันจะหายไปด้วย และจะติดต่อคุณผ่าน Friend Code ไม่ได้อีก`
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

      {encouragementSheetOpen && (
        <SendEncouragementSheet
          recipientId={profile.friendUserId}
          onSent={() => {
            setEncouragementSheetOpen(false);
            setAlreadySentToday(true);
            setToastMessage("ส่งกำลังใจแล้ว!");
          }}
          onClose={() => setEncouragementSheetOpen(false)}
        />
      )}

      {toastMessage && <Toast message={toastMessage} onDone={() => setToastMessage(null)} />}
    </div>
  );
}
