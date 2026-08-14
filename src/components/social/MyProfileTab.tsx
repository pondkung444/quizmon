"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Pencil, ShieldOff, Heart, Copy, Check } from "lucide-react";
import { type AchievementCardData } from "@/components/AchievementCard";
import StatRadar from "@/components/StatRadar";
import BottomSheet from "@/components/social/BottomSheet";
import Toast from "@/components/social/Toast";
import SelectPrideQmonSheet from "@/components/social/SelectPrideQmonSheet";
import SelectMedalsSheet from "@/components/social/SelectMedalsSheet";
import SelectFavoriteQmonSheet from "@/components/social/SelectFavoriteQmonSheet";
import JourneyStatsGrid from "@/components/social/JourneyStatsGrid";
import { resolvePetDisplay, type PetSummary } from "@/components/social/petSummary";
import { formatFriendCode } from "@/lib/friendCode";
import type { ProfileJourneyStats } from "@/lib/profileJourneyStats";

export type EquippedGearSummary = { slot: "head" | "body" | "feet"; quality: string };

// สีขอบตามระดับเหรียญ — คัดลอกโทนสีจาก TIER_STYLE ใน AchievementCard.tsx (ไม่ export มาใช้ร่วม
// เพราะไม่อยากผูก MyProfileTab เข้ากับ internal ของสมุด Achievement ที่ใช้กว้างกว่านี้)
const MEDAL_TIER_BORDER: Record<string, string> = {
  Bronze: "border-[#cd7f32]/60",
  Silver: "border-[#b9c2cf]/60",
  Gold: "border-gold/70",
  Crown: "border-[#c7a6f7]/60",
};

export type ProfileTabData = {
  username: string;
  pridePetIdSetting: string | null;
  activePetId: string | null;
  favoritePetIdsSetting: string[];
  pinnedAchievementIdsSetting: string[];
  prideCandidates: PetSummary[]; // is_active OR stage4
  earnedAchievements: AchievementCardData[];
  journeyStats: ProfileJourneyStats;
  equippedGearByPetId: Record<string, EquippedGearSummary[]>;
  blockedCount: number;
  likeCount: number;
  friendCode: string;
};

// การ์ด Qmon ที่ภูมิใจ — แถวเดียว (ภาพวงกลม+ชื่อ 2 บรรทัด | radar) ตัดบอก Stage/สาย/บุคลิก/อุปกรณ์
// ออกทั้งหมดตามที่ปอนด์ยืนยัน (revision หลัง mockup) — stats เป็น null ได้ปกติ (Qmon ยังไม่ถึง
// stage 4) StatRadar จัดการ null เองอยู่แล้ว (โชว์แค่โครง ไม่มีเลขกำกับ)
function PrideQmonRow({
  pet,
  stats,
}: {
  pet: PetSummary;
  stats: { hp: number; atk: number; def: number; spd: number; foc: number } | null;
}) {
  const { imagePath, speciesName } = resolvePetDisplay(pet);
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gold-dim bg-card p-4">
      <div className="flex w-24 flex-none flex-col items-center gap-1 text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-track">
          {imagePath && (
            <Image src={imagePath} alt={speciesName} width={80} height={80} className="h-20 w-20 object-contain" />
          )}
        </div>
        <p className="w-full truncate text-sm font-bold text-text">{pet.nickname ?? speciesName}</p>
        <p className="line-clamp-2 w-full text-center text-xs leading-tight text-text3">{speciesName}</p>
      </div>
      <div className="min-w-0 flex-1">
        <StatRadar stats={stats} showValues />
      </div>
    </div>
  );
}

export default function MyProfileTab({ data }: { data: ProfileTabData }) {
  const [pridePetId, setPridePetId] = useState<string | null>(data.pridePetIdSetting ?? data.activePetId);
  const [favoritePetIds, setFavoritePetIds] = useState<string[]>(data.favoritePetIdsSetting);
  const [pinnedAchievementIds, setPinnedAchievementIds] = useState<string[]>(data.pinnedAchievementIdsSetting);
  const [openSheet, setOpenSheet] = useState<"pride" | "medals" | "favorites" | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [friendCodeCopied, setFriendCodeCopied] = useState(false);

  async function handleCopyFriendCode() {
    try {
      await navigator.clipboard.writeText(data.friendCode);
      setFriendCodeCopied(true);
      setTimeout(() => setFriendCodeCopied(false), 2000);
    } catch {
      setToastMessage("คัดลอกไม่สำเร็จ ลองกดค้างแล้วคัดลอกเองนะ");
    }
  }

  const stage4Pets = useMemo(() => data.prideCandidates.filter((p) => p.stage === 4), [data.prideCandidates]);
  const pridePet = useMemo(
    () => data.prideCandidates.find((p) => p.id === pridePetId) ?? null,
    [data.prideCandidates, pridePetId]
  );
  const favoritePets = useMemo(
    () => favoritePetIds.map((id) => stage4Pets.find((p) => p.id === id)).filter((p): p is PetSummary => !!p),
    [favoritePetIds, stage4Pets]
  );
  const pinnedMedals = useMemo(
    () =>
      pinnedAchievementIds
        .map((id) => data.earnedAchievements.find((a) => a.id === id))
        .filter((a): a is AchievementCardData => !!a),
    [pinnedAchievementIds, data.earnedAchievements]
  );

  const hasFullStats =
    !!pridePet &&
    pridePet.statHp != null &&
    pridePet.statAtk != null &&
    pridePet.statDef != null &&
    pridePet.statSpd != null &&
    pridePet.statFoc != null;
  const prideStats =
    hasFullStats && pridePet
      ? {
          hp: pridePet.statHp as number,
          atk: pridePet.statAtk as number,
          def: pridePet.statDef as number,
          spd: pridePet.statSpd as number,
          foc: pridePet.statFoc as number,
        }
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. ข้อมูลผู้เล่น + ยอดถูกใจ (ย้ายมาอยู่ข้างชื่อตามที่ปอนด์ขอ — เดิมอยู่แยกใต้ Qmon ที่ภูมิใจ)
          ยอดถูกใจ read-only ล้วนๆ กดถูกใจตัวเองไม่ได้ตามกฎเดิม */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text3">ชื่อในเกม</p>
          <h1 className="truncate text-xl font-bold text-gold-hi">{data.username}</h1>
        </div>
        <div className="flex flex-none items-center gap-1.5 rounded-full border border-red/30 bg-red/10 px-3 py-1.5 text-sm font-bold text-red">
          <Heart className="h-4 w-4 fill-red" />
          {data.likeCount}
        </div>
      </div>

      {/* 2. Qmon ที่ภูมิใจ */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gold-hi">Qmon ที่ภูมิใจ</h2>
          <button
            type="button"
            onClick={() => setOpenSheet("pride")}
            aria-label="แก้ไข Qmon ที่ภูมิใจ"
            className="flex h-11 w-11 items-center justify-center rounded-full text-text3 transition active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {!pridePet ? (
          <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
            ยังไม่มี Qmon — ฟักไข่ใบแรกก่อนนะ
          </p>
        ) : (
          <PrideQmonRow pet={pridePet} stats={prideStats} />
        )}
      </section>

      {/* 3. เหรียญแห่งความภูมิใจ */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gold-hi">เหรียญแห่งความภูมิใจ</h2>
          <button
            type="button"
            onClick={() => setOpenSheet("medals")}
            aria-label="แก้ไขเหรียญแห่งความภูมิใจ"
            className="flex h-11 w-11 items-center justify-center rounded-full text-text3 transition active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        {pinnedMedals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold-dim bg-card p-6 text-center">
            <p className="text-sm text-text3">เลือกเหรียญที่คุณภูมิใจ</p>
            <button
              type="button"
              onClick={() => setOpenSheet("medals")}
              className="flex min-h-11 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95"
            >
              เลือกเหรียญ
            </button>
          </div>
        ) : (
          <div className="flex justify-center gap-4">
            {pinnedMedals.map((medal) => (
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
        <Link href="/achievements" className="self-end text-xs text-text3 underline underline-offset-2 hover:text-gold-hi">
          ดู Achievement ทั้งหมด
        </Link>
      </section>

      {/* 4. เส้นทางของฉัน */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-gold-hi">เส้นทางของฉัน</h2>
        <JourneyStatsGrid stats={data.journeyStats} />
      </section>

      {/* 5. Qmon ตัวโปรด — กดไม่ได้ (§4.6) */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gold-hi">Qmon ตัวโปรด</h2>
          <button
            type="button"
            onClick={() => setOpenSheet("favorites")}
            aria-label="แก้ไข Qmon ตัวโปรด"
            className="flex h-11 w-11 items-center justify-center rounded-full text-text3 transition active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        {favoritePets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold-dim bg-card p-6 text-center">
            <p className="text-sm text-text3">เลือก Qmon ตัวโปรดของคุณ</p>
            <button
              type="button"
              onClick={() => setOpenSheet("favorites")}
              className="flex min-h-11 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95"
            >
              เลือก Qmon
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {favoritePets.map((pet) => {
              const { imagePath, speciesName } = resolvePetDisplay(pet);
              return (
                <div
                  key={pet.id}
                  className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-gold bg-track p-2"
                >
                  {imagePath && <Image src={imagePath} alt={speciesName} width={90} height={90} className="h-16 w-16 object-contain" />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Friend Code — reuse format/copy pattern เดียวกับ S06 (AddFriendView.tsx) */}
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-gold-dim bg-card p-4 text-center">
        <p className="text-xs text-text3">Friend Code ของฉัน</p>
        <p className="text-xl font-bold tracking-widest text-gold-hi">{formatFriendCode(data.friendCode)}</p>
        <button
          type="button"
          onClick={handleCopyFriendCode}
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl border border-gold-dim px-4 text-sm font-bold text-text3 transition active:scale-95"
        >
          {friendCodeCopied ? <Check className="h-4 w-4 text-amber" /> : <Copy className="h-4 w-4" />}
          {friendCodeCopied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </section>

      {/* 7. ลิงก์เล็กๆ ไปหน้าบัญชีที่บล็อก — ยังไม่คุ้มสร้างหน้า "การตั้งค่า" กลางแยกต่างหากเพราะมีแค่
          รายการเดียวตอนนี้ (เอกสารเดิมเขียนเป็น สังคม→โปรไฟล์→แก้ไข→บัญชีที่บล็อก แต่ลัดตรงมาแทน) */}
      <Link
        href="/social/blocked"
        className="flex items-center gap-2 self-start text-xs text-text3 underline underline-offset-2 hover:text-gold-hi"
      >
        <ShieldOff className="h-3.5 w-3.5" />
        บัญชีที่บล็อก{data.blockedCount > 0 ? ` (${data.blockedCount})` : ""}
      </Link>

      {openSheet === "pride" && (
        <SelectPrideQmonSheet
          candidates={data.prideCandidates}
          currentPrideId={pridePetId}
          onSaved={(result) => {
            setPridePetId(result.pridePetId);
            setFavoritePetIds(result.favoritePetIds);
            setOpenSheet(null);
            setToastMessage("บันทึก Qmon ที่ภูมิใจแล้ว");
          }}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {openSheet === "medals" && (
        <SelectMedalsSheet
          earnedAchievements={data.earnedAchievements}
          currentPinnedIds={pinnedAchievementIds}
          onSaved={(ids) => {
            setPinnedAchievementIds(ids);
            setOpenSheet(null);
            setToastMessage("บันทึกเหรียญที่ปักหมุดแล้ว");
          }}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {openSheet === "favorites" && (
        <SelectFavoriteQmonSheet
          stage4Pets={stage4Pets}
          currentPrideId={pridePetId}
          currentFavoriteIds={favoritePetIds}
          onSaved={(ids) => {
            setFavoritePetIds(ids);
            setOpenSheet(null);
            setToastMessage("บันทึก Qmon ตัวโปรดแล้ว");
          }}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {toastMessage && <Toast message={toastMessage} onDone={() => setToastMessage(null)} />}
    </div>
  );
}
