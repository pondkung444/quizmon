import Image from "next/image";
import { Crown, Medal } from "lucide-react";

export type AchievementTier = "Bronze" | "Silver" | "Gold" | "Crown";

export type AchievementCardData = {
  id: string;
  name: string;
  conditionText: string;
  tier: AchievementTier;
  imageFile: string;
  progressMetric: string | null;
  progressTarget: number | null;
  currentValue: number | null; // มีค่าเฉพาะ progressMetric ไม่ null
  earned: boolean; // ยึด user_achievements (ledger) เป็นความจริงเสมอ ไม่ใช้ currentValue ตัดสิน
  earnedAtLabel: string | null; // วันที่แปลงเป็น Asia/Bangkok แล้ว
  earnedByLabel: string | null; // "โดย <ชื่อ>" หรือ null
};

// ระดับเหรียญไม่มีโทนสีสำเร็จรูปในธีมเดิม (gold/indigo ถูกจองไว้ใช้ที่อื่นแล้ว) — กำหนดสีเฉพาะจุดนี้
const TIER_STYLE: Record<AchievementTier, { textClass: string; borderClass: string; Icon: typeof Crown }> = {
  Bronze: { textClass: "text-[#cd7f32]", borderClass: "border-[#cd7f32]/50", Icon: Medal },
  Silver: { textClass: "text-[#b9c2cf]", borderClass: "border-[#b9c2cf]/50", Icon: Medal },
  Gold: { textClass: "text-gold-hi", borderClass: "border-gold/60", Icon: Medal },
  Crown: { textClass: "text-[#c7a6f7]", borderClass: "border-[#c7a6f7]/50", Icon: Crown },
};

export default function AchievementCard({ data }: { data: AchievementCardData }) {
  const tierStyle = TIER_STYLE[data.tier];
  const TierIcon = tierStyle.Icon;
  const hasProgress = data.progressMetric !== null && data.progressTarget !== null;
  const current = data.currentValue ?? 0;
  const target = data.progressTarget ?? 0;
  const fraction = target > 0 ? Math.min(1, current / target) : 0;

  return (
    <div className="flex gap-3 rounded-2xl border border-gold-dim bg-card p-3">
      <Image
        src={`/achievement/${data.imageFile}`}
        alt={data.name}
        width={64}
        height={64}
        className="h-16 w-16 flex-none object-contain"
        style={data.earned ? undefined : { filter: "grayscale(1) brightness(0.6) opacity(0.5)" }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-bold text-text">{data.name}</p>
          <span
            className={`flex flex-none items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tierStyle.borderClass} ${tierStyle.textClass}`}
          >
            <TierIcon className="h-3 w-3" />
            {data.tier}
          </span>
        </div>

        <p className="text-xs text-text3">{data.conditionText}</p>

        {hasProgress && (
          <div className="mt-1">
            <p className="mb-0.5 text-[11px] text-text2">
              {Math.min(current, target)}/{target}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-track">
              <div className="h-full bg-amber transition-all" style={{ width: `${fraction * 100}%` }} />
            </div>
          </div>
        )}

        {data.earned ? (
          <p className="mt-1 text-[11px] font-medium text-gold-hi">
            ได้รับแล้ว · {data.earnedAtLabel}
            {data.earnedByLabel ? ` ${data.earnedByLabel}` : ""}
          </p>
        ) : (
          !hasProgress && <p className="mt-1 text-xs font-medium text-text2">ยังไม่ได้รับ</p>
        )}
      </div>
    </div>
  );
}
