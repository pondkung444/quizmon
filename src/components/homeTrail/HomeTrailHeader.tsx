"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import QmonChatBubble from "@/components/QmonChatBubble";
import { STAGE_EXP_THRESHOLD, STAGE_LABEL_TH } from "@/lib/evolution";

// หัวหน้าแรกทางเดิน: รูปน้องเล็ก + ชื่อ + "ระยะ n · อีก X EXP" + แถบความคืบหน้าในระยะ + ชิปวันที่เล่นในสัปดาห์
// QmonChatBubble วางข้างชิปสัปดาห์ ที่เดียวกันทุกขนาดจอ (ปอนด์เลือก 2026-10-26)
export default function HomeTrailHeader({
  displayName,
  stage,
  exp,
  petImagePath,
  daysPlayedThisWeek,
}: {
  displayName: string;
  stage: number;
  exp: number;
  petImagePath: string | null;
  daysPlayedThisWeek: number;
}) {
  const router = useRouter();
  const next = STAGE_EXP_THRESHOLD[stage];
  const prev = STAGE_EXP_THRESHOLD[stage - 1] ?? 0;
  const pct = next ? Math.min(100, Math.max(0, ((exp - prev) / (next - prev)) * 100)) : 100;
  const sub =
    stage === 1 ? (
      "ไข่ · ยังไม่ฟัก"
    ) : next ? (
      <>
        ระยะ {stage} · <span className="whitespace-nowrap">อีก {Math.max(0, next - exp)} EXP</span>
      </>
    ) : (
      `ระยะ ${stage} · ${STAGE_LABEL_TH[stage]?.name ?? ""}`
    );

  return (
    <header className="ht-me">
      <div className="ht-ava">
        {petImagePath && <Image src={petImagePath} alt="" width={64} height={64} />}
      </div>
      <div className="ht-who">
        <h1 className="font-sarabun">{displayName}</h1>
        <p className="ht-sub">{sub}</p>
        <div className="ht-bar" role="img" aria-label={`ความคืบหน้าระยะ ${Math.round(pct)}%`}>
          <i style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
      </div>
      {/* จอเตี้ยแนวนอน: เหลือแค่ไอคอน (CSS ซ่อน .ht-week-full) — ชื่อปุ่มมาจาก aria-label */}
      <button
        type="button"
        className="ht-week"
        aria-label={daysPlayedThisWeek > 0 ? `เล่น ${daysPlayedThisWeek} วัน สัปดาห์นี้` : "ดูสัปดาห์นี้"}
        onClick={() => router.push("/pet/calendar")}
      >
        <span className="ht-week-full" aria-hidden>
          {daysPlayedThisWeek > 0 ? (
            <>
              <b>{daysPlayedThisWeek}</b>วัน<br />สัปดาห์นี้
            </>
          ) : (
            <>
              <CalendarDays className="ht-week-ic" />
              สัปดาห์นี้
            </>
          )}
        </span>
        <CalendarDays className="ht-week-only-ic" aria-hidden />
      </button>
      <div className="ht-chat">
        <QmonChatBubble />
      </div>
    </header>
  );
}
