"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { resolvePetDisplay } from "@/components/social/petSummary";
import { sendFriendRequest, type RelationshipStatus } from "@/app/social/actions";
import { FRIEND_STATUS_MESSAGE, FRIEND_ACTIONABLE_STATUSES } from "@/components/social/friendActionStatus";
import LikeButton from "@/components/social/LikeButton";
import StatRadar from "@/components/StatRadar";
import Toast from "@/components/social/Toast";
import type { PublicProfileResult } from "@/lib/publicProfile";

// สีขอบตามระดับเหรียญ — คัดลอกจาก MyProfileTab.tsx (ตั้งใจไม่ export มาใช้ร่วม เหตุผลเดียวกับที่นั่น)
const MEDAL_TIER_BORDER: Record<string, string> = {
  Bronze: "border-[#cd7f32]/60",
  Silver: "border-[#b9c2cf]/60",
  Gold: "border-gold/70",
  Crown: "border-[#c7a6f7]/60",
};

// self/friends redirect ฝั่ง server component ก่อนถึงตรงนี้แล้ว (page.tsx) — เหลือแค่ 4 สถานะ
// ที่จะมาถึง view นี้จริงๆ: available, pending_sent, pending_received, friend_list_full
export default function PublicProfileView({
  profile,
}: {
  profile: Extract<PublicProfileResult, { found: true }>;
}) {
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>(profile.relationshipStatus);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { imagePath, speciesName } = profile.pet
    ? resolvePetDisplay(profile.pet)
    : { imagePath: null, speciesName: "" };

  async function handleSend() {
    if (isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    try {
      const res = await sendFriendRequest(profile.targetUserId);
      setRelationshipStatus(res.autoAccepted ? "friends" : "pending_sent");
      setToastMessage(res.autoAccepted ? "เพิ่มเพื่อนสำเร็จ!" : "ส่งคำขอเป็นเพื่อนแล้ว");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setIsSending(false);
    }
  }

  const isActionable = FRIEND_ACTIONABLE_STATUSES.includes(relationshipStatus);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/social" className="flex items-center gap-1 text-sm text-text3 transition hover:text-gold-hi">
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gold-hi">{profile.username}</h1>
      </div>

      {/* Qmon ที่ภูมิใจ + radar แถวเดียวกัน — pattern เดียวกับ S03/S05 เป๊ะ (revision หลังเฟส 6:
          เปิดสเตตัสให้คนทั่วไปเห็นด้วย ตัดสินใจใหม่ พลิก §5.3 เดิม เฉพาะสเตตัส ไม่รวมอุปกรณ์) */}
      <div className="flex items-center gap-4 rounded-2xl border border-gold-dim bg-card p-4">
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

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-3">
          <LikeButton
            targetUserId={profile.targetUserId}
            initialLiked={profile.likedByMe}
            initialCount={profile.likeCount}
          />
          {isActionable && (
            <button
              type="button"
              disabled={isSending}
              onClick={handleSend}
              className="min-h-11 flex-none rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
            >
              {isSending ? "กำลังส่ง..." : "เพิ่มเพื่อน"}
            </button>
          )}
        </div>
        {FRIEND_STATUS_MESSAGE[relationshipStatus] && (
          <p className="text-center text-xs text-text3">{FRIEND_STATUS_MESSAGE[relationshipStatus]}</p>
        )}
        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}
      </div>

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

      {toastMessage && <Toast message={toastMessage} onDone={() => setToastMessage(null)} />}
    </div>
  );
}
