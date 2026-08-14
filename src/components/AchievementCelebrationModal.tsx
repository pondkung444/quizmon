"use client";

import { useState } from "react";
import Image from "next/image";
import { Crown, Medal } from "lucide-react";
import { markAchievementsCelebrated } from "@/app/achievements/actions";
import type { AchievementTier } from "@/components/AchievementCard";

export type CelebrationItem = {
  id: string;
  name: string;
  tier: AchievementTier;
  conditionText: string;
  imageFile: string;
};

// โทนฉลอง = กรอบเรืองแสงตาม tier (แทนกรอบเรียบของการ์ดในหน้าสมุด) — ไม่ทำ confetti/animation
// เพิ่มเติม สโคปเล็กพอทำเสร็จไวตามที่ระบุใน handoff
const TIER_GLOW: Record<AchievementTier, { ringClass: string; textClass: string; Icon: typeof Crown }> = {
  Bronze: { ringClass: "border-[#cd7f32] shadow-[0_0_16px_rgba(205,127,50,0.45)]", textClass: "text-[#cd7f32]", Icon: Medal },
  Silver: { ringClass: "border-[#b9c2cf] shadow-[0_0_16px_rgba(185,194,207,0.45)]", textClass: "text-[#b9c2cf]", Icon: Medal },
  Gold: { ringClass: "border-gold shadow-[0_0_16px_rgba(200,168,106,0.5)]", textClass: "text-gold-hi", Icon: Medal },
  Crown: { ringClass: "border-[#c7a6f7] shadow-[0_0_18px_rgba(199,166,247,0.55)]", textClass: "text-[#c7a6f7]", Icon: Crown },
};

// items มาจาก server (page.tsx) หลัง evaluate_achievements + query เสร็จแล้วเท่านั้น — การันตี
// "mount หลังข้อมูลพร้อม" โดยโครงสร้าง (ไม่ใช่แค่ guard ฝั่ง client) เพราะ RSC ส่ง props นี้ลงมา
// พร้อมกับ HTML ของทั้งหน้าทีเดียว ไม่มีทาง mount ก่อนหน้าโหลดเสร็จ
export default function AchievementCelebrationModal({ items }: { items: CelebrationItem[] }) {
  const [open, setOpen] = useState(items.length > 0);
  const [closing, setClosing] = useState(false);

  if (!open || items.length === 0) return null;

  async function handleClose() {
    setClosing(true);
    try {
      // ต้องรอ RPC จบก่อนปิด UI เสมอ — ถ้าพังกลางทาง (เช่น รีเฟรชหลุด) ปล่อยให้โมดัลเด้งซ้ำตอนโหลด
      // หน้าถัดไปแทนที่จะเสี่ยง mark ทิ้งไปทั้งที่ยังไม่เห็นจริง (ดู edge case ในเอกสาร handoff)
      await markAchievementsCelebrated(items.map((item) => item.id));
    } catch (err) {
      console.error("markAchievementsCelebrated failed:", err);
    } finally {
      setOpen(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-6">
        <div className="flex-none text-center">
          <p className="text-sm text-text3">🎉 ปลดล็อกเหรียญใหม่</p>
          <h2 className="text-xl font-bold text-gold-hi">
            {items.length === 1 ? "ยินดีด้วย!" : `ยินดีด้วย! ได้รับ ${items.length} เหรียญ`}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {items.map((item) => {
            const style = TIER_GLOW[item.tier];
            const TierIcon = style.Icon;
            return (
              <div
                key={item.id}
                className={`flex flex-none items-center gap-3 rounded-xl border bg-track p-3 ${style.ringClass}`}
              >
                <Image
                  src={`/achievement/${item.imageFile}`}
                  alt={item.name}
                  width={56}
                  height={56}
                  className="h-14 w-14 flex-none object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text">{item.name}</p>
                  <p className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${style.textClass}`}>
                    <TierIcon className="h-3 w-3" />
                    {item.tier}
                  </p>
                  <p className="mt-0.5 text-xs text-text3">{item.conditionText}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleClose}
          disabled={closing}
          className="w-full flex-none rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {closing ? "กำลังบันทึก..." : "เยี่ยมมาก!"}
        </button>
      </div>
    </div>
  );
}
