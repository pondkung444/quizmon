"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import CollectPetButton from "@/components/CollectPetButton";
import type { EggChoice } from "@/components/EggChoiceModal";
import StatRadar from "@/components/StatRadar";
import SpeechBubble from "@/components/SpeechBubble";
import { usePersonalityMessage } from "@/hooks/usePersonalityMessage";
import type { PersonalityKey } from "@/lib/personality";
import { getEvolutionProgress } from "@/lib/evolution";
import EvolutionGlow from "@/components/EvolutionGlow";
import WeeklyJourneyCard from "@/components/WeeklyJourneyCard";
import type { JourneyDay } from "@/lib/weeklyJourney";
import WeeklyLeaderboardCard from "@/components/WeeklyLeaderboardCard";
import type { MyWeeklyRank } from "@/lib/weeklyLeaderboard";
import TopicStatsSheet from "@/components/TopicStatsSheet";
import type { TopicStatsResult } from "@/lib/topicStats";
import MissionCard from "@/components/MissionCard";
import type { TodayMissionResult } from "@/lib/missions";
import type { Subline } from "@/lib/evolution";
import FeedPetCard from "@/components/FeedPetCard";

const EVOLVE_ANIMATION_MS = 650;

export default function PetCard({
  petId,
  stage,
  stageName,
  stageDescription,
  exp,
  nextThreshold,
  progress,
  nickname,
  speciesName,
  petImagePath,
  statHp,
  statAtk,
  statDef,
  statSpd,
  statFoc,
  mathCorrect,
  scienceCorrect,
  comboMilestones,
  expToday,
  dailyCap,
  justEvolved,
  eggChoices,
  personalityKey,
  journeyDays,
  topicStats,
  mission,
  myWeeklyRank,
  subline,
  foodA,
  foodB,
}: {
  petId: string;
  stage: number;
  stageName: string;
  stageDescription: string;
  exp: number;
  nextThreshold: number | undefined;
  progress: number;
  nickname: string | null;
  speciesName: string | null;
  petImagePath: string | null;
  statHp: number | null;
  statAtk: number | null;
  statDef: number | null;
  statSpd: number | null;
  statFoc: number | null;
  mathCorrect: number;
  scienceCorrect: number;
  comboMilestones: number;
  expToday: number;
  dailyCap: number;
  justEvolved: boolean;
  eggChoices: EggChoice[];
  personalityKey: PersonalityKey;
  journeyDays: JourneyDay[];
  topicStats: TopicStatsResult;
  mission: TodayMissionResult | null;
  myWeeklyRank: MyWeeklyRank;
  subline: Subline | null;
  foodA: number;
  foodB: number;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [tapPulse, setTapPulse] = useState(0);
  const [showTopicStats, setShowTopicStats] = useState(false);
  const { message: personalityMessage, triggerEvent: triggerPersonalityEvent } =
    usePersonalityMessage(personalityKey);

  useEffect(() => {
    if (!justEvolved) return;
    const timer = setTimeout(() => router.replace("/pet"), EVOLVE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [justEvolved, router]);

  const isMaxStage = stage === 4;
  const cappedToday = expToday >= dailyCap;
  const dailyProgress = Math.min(1, dailyCap > 0 ? expToday / dailyCap : 1);
  // ภารกิจยังไม่จบ (state 1/2) -> การ์ดภารกิจเป็น CTA หลักแทนปุ่ม "ฝึก Qmon" ไปเต็มๆ ไม่ใช่การ์ด
  // เสริมซ้อนกับ CTA อีกก้อน (แก้ปัญหาของสำคัญหลุด fold บนมือถือ)
  const missionActive = !!mission && mission.answeredCount < mission.mission.target_count;

  const hasFullStats =
    statHp != null && statAtk != null && statDef != null && statSpd != null && statFoc != null;

  const idleAnimClass = stage === 1 ? "animate-egg-wobble" : "animate-pet-bob";
  const evolutionProgress = getEvolutionProgress(stage, exp);

  // segmented evolution bar (ux pass 2026-07): แถบเดิมเป็น smooth bar สีเดียวกับหลอด "พลังวันนี้"
  // (amber ทั้งคู่) แยกไม่ออกถ้าไม่อ่าน label ตัวเล็ก — เปลี่ยนเป็น 4 ช่อง segmented สี indigo แทน
  // (โทนเย็น คนละกลุ่มกับ amber ของหลอดรายวัน + รูปทรงต่างกันชัด) แต่ละช่อง = 1 ระยะ ช่องที่ผ่านแล้ว
  // เต็ม 100% ช่องปัจจุบันเติมตาม progress ช่องที่ยังไม่ถึงว่างเปล่า ให้เห็นภาพรวมทั้ง 4 ระยะในแถบเดียว
  // ต่างจากเดิมที่โชว์แค่ % ภายในระยะปัจจุบันเท่านั้น
  const evolutionSegments = [1, 2, 3, 4].map((s) => {
    if (s < stage) return 1;
    if (s === stage) return isMaxStage ? 1 : progress;
    return 0;
  });

  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-gold-dim bg-card p-5 text-center">
      {/* 1. weekly journey — แถบสรุปสีบางๆ เท่านั้น (รายละเอียดเต็มดูที่ /pet/calendar) กดเข้าได้ */}
      <WeeklyJourneyCard days={journeyDays} onClick={() => router.push("/pet/calendar")} />

      {/* 1.5 weekly leaderboard — ทดลอง (2026-07) collapsed แถวเดียว กดขยาย Top 5 in-place อยู่ใต้
          journey strip ทันที เหนือ nameplate/avatar ของ pet card หลัก ดู WeeklyLeaderboardCard.tsx */}
      <WeeklyLeaderboardCard myWeeklyRank={myWeeklyRank} />

      {/* 2. nameplate — เปลี่ยนจากทรงเพชร (หมุน 45°) เป็นแคปซูล/pill (ux pass 2026-07 รอบ 3)
          เหตุผล: เพชรใช้พื้นที่แนวตั้งไม่คุ้ม (มุมทั้ง 4 เสียเปล่า ต้องสูงถึง 64px เพื่อใส่ข้อความ
          บรรทัดเดียวที่จริงสูงแค่ ~14px) พอเปลี่ยนเป็น pill เหลือแค่ ~36px — ได้พื้นที่คืนอีก ~24-28px
          ช่วยลด scroll เคส mission-active ที่ยังเหลืออยู่ ไม่ต้องมี whitespace-nowrap hack กันตัดมุม
          อีกต่อไปเพราะไม่มีมุมให้ตัดแล้ว — เปลี่ยนพร้อมกันทั้ง CollectedPetCard.tsx (/collection) ด้วย
          เพื่อความสม่ำเสมอ ตามที่ปอนด์เลือก (ทางเลือกที่ 2 จาก 3 ตัวเลือกที่เสนอไป) */}
      <div className="flex h-9 items-center justify-center rounded-full border-2 border-gold bg-track px-4">
        <span className="whitespace-nowrap text-xs font-bold text-gold-hi">
          {nickname ?? speciesName ?? stageName}
        </span>
      </div>

      {/* 3. avatar (click to expand) */}
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
          setTapPulse((n) => n + 1);
          triggerPersonalityEvent("tapQmon");
        }}
        className="relative flex h-[220px] w-[220px] items-center justify-center"
        aria-expanded={expanded}
      >
        {personalityMessage && (
          <div className="absolute -top-2 z-10 -translate-y-full">
            <SpeechBubble message={personalityMessage} />
          </div>
        )}
        <span className="absolute h-[200px] w-[200px] rounded-full bg-amber opacity-20 blur-2xl" />
        <svg viewBox="0 0 200 200" className="absolute h-[190px] w-[190px] animate-spin-slow opacity-40">
          <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-gold)" strokeWidth={1} strokeDasharray="4 10" />
          <circle cx="100" cy="100" r="72" fill="none" stroke="var(--color-gold)" strokeWidth={1} strokeDasharray="1 8" />
        </svg>
        <div className={`relative flex items-center justify-center ${!justEvolved ? idleAnimClass : ""}`}>
          <div key={tapPulse} className={tapPulse > 0 ? "animate-pet-tap" : ""}>
            {petImagePath ? (
              <EvolutionGlow progress={evolutionProgress} dailyCapped={cappedToday}>
                <Image
                  src={petImagePath}
                  alt="ภาพ Qmon"
                  width={180}
                  height={180}
                  priority
                  className={`relative ${justEvolved ? "animate-evolve-pop" : ""}`}
                />
              </EvolutionGlow>
            ) : (
              <div
                className={`relative flex h-[180px] w-[180px] items-center justify-center rounded-xl bg-track text-sm text-text3 ${
                  justEvolved ? "animate-evolve-pop" : ""
                }`}
              >
                ไม่พบรูป Qmon
              </div>
            )}
          </div>
        </div>
      </button>

      {/* 4. exp -> next stage — segmented bar, 1 ช่อง = 1 ระยะ (ดู evolutionSegments ด้านบน)
          label บรรทัดแรกรวมข้อความ "ระยะ N · ชื่อระยะ" ที่เคยเป็นบล็อกแยกใต้ nameplate เข้ามาด้วย
          (ตัด stageDescription ทิ้ง — เป็น flavor text ซ้ำความหมายกับชื่อระยะ ไม่ใช่ข้อมูลที่ต้องรู้) */}
      <div className="w-full max-w-xs">
        <p className="mb-1 text-left text-xs text-text2">
          พลังวิวัฒนาการ · ระยะ {stage}: {stageName}
        </p>
        <div className="flex gap-1">
          {evolutionSegments.map((fill, i) => (
            <div key={i} className="h-2.5 flex-1 overflow-hidden rounded-full bg-track">
              <div className="h-full bg-indigo transition-all" style={{ width: `${fill * 100}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-text3">
          {nextThreshold !== undefined
            ? `อีก ${Math.max(0, nextThreshold - exp)} แต้ม จะโตเป็นระยะถัดไป`
            : "โตเต็มที่แล้ว! เก่งมาก 🎉"}
        </p>
      </div>

      {/* 5. daily training bar */}
      <div className="w-full max-w-xs">
        <p className="mb-1 text-left text-xs text-text2">พลังวันนี้</p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-track">
          <div className="h-full bg-amber transition-all" style={{ width: `${dailyProgress * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-text3">
          {Math.min(expToday, dailyCap)} / {dailyCap} แต้ม
        </p>
        {cappedToday && (
          <p className="mt-2 rounded-xl border border-amber-dim bg-amber/10 p-2 text-xs text-amber">
            น้องอิ่มความรู้แล้ววันนี้ พรุ่งนี้มาฝึกต่อนะ
          </p>
        )}
      </div>

      {/* 5.5/6 บล็อกแอ็กชันรวม — การ์ดภารกิจกับ CTA "ฝึก Qmon" เดิมเคยเป็นสองบล็อกซ้อนกัน ทำหน้าที่
          ซ้ำกัน (ทั้งคู่คือ "จะฝึกอะไรวันนี้") รวมเป็นก้อนเดียวที่สลับตามสถานะภารกิจแทน:
          - ภารกิจยังไม่จบ (missionActive) -> MissionCard คือ CTA หลักไปเลย ไม่โชว์ปุ่ม "ฝึก Qmon" ซ้ำ
          - ภารกิจจบแล้ว/ไม่มีภารกิจ -> MissionCard ยุบเหลือ chip (หรือไม่โชว์อะไรถ้า mission null)
            แล้ว CTA "ฝึก Qmon"/"ฝึกต่อได้" เดิมกลับมาเป็นหลักตามเดิม
          isMaxStage ยังทับทุกกรณีเหมือนเดิม (เก็บสัตว์เข้าสมุดสำคัญกว่าเสมอตอนโตเต็มที่แล้ว) */}
      {isMaxStage ? (
        <CollectPetButton eggChoices={eggChoices} />
      ) : missionActive ? (
        <MissionCard mission={mission} subline={subline} />
      ) : (
        <>
          <MissionCard mission={mission} subline={subline} />
          {cappedToday ? (
            <div className="flex w-full max-w-xs flex-col items-center gap-1">
              <Link
                href="/quiz"
                className="w-full rounded-2xl border-2 border-gold py-3 text-lg font-bold text-gold-hi transition active:scale-95"
              >
                ฝึกต่อได้
              </Link>
              <p className="text-xs text-text3">ฝึกเพิ่มได้ แต่วันนี้ไม่ดันระยะแล้ว</p>
            </div>
          ) : (
            <Link
              href="/quiz"
              className="w-full max-w-xs rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
            >
              ฝึก Qmon
            </Link>
          )}
        </>
      )}

      {/* ── จบ fold แรกที่ตั้งใจ (journey strip -> nameplate -> avatar -> evolution/daily bars -> CTA) ── */}
      {/* ของรองด้านล่างนี้ไม่ต้องตัดสินใจอะไรวันนี้ ไม่จำเป็นต้องอยู่บนสุด: */}

      {/* 6.6 ป้อนอาหาร — เฉพาะก่อน stage 4 และเฉพาะตอนมีอาหารในคลังจริง (กัน dead-end กดเข้าไป
          แล้วเจอ "มี 0 ชิ้น" — หลักเดียวกับ mission chip: สถานะที่ไม่รอ action ไม่ควรกินที่) */}
      {!isMaxStage && foodA + foodB > 0 && (
        <FeedPetCard petId={petId} initialFoodA={foodA} initialFoodB={foodB} />
      )}

      {/* 6.7 ปุ่มเปิดสถิติแยกบท — ขยาย touch target เป็น 44px + ใส่ label (เดิม 32px icon ล้วน
          ต่ำกว่ามาตรฐาน touch target และไม่มีคำกำกับ ซึ่งไม่เหมาะกับกลุ่มเป้าหมายเด็ก) */}
      <button
        type="button"
        onClick={() => setShowTopicStats(true)}
        className="flex h-11 items-center gap-2 rounded-full border border-gold-dim bg-track px-4 text-sm font-medium text-text2 transition active:scale-95"
      >
        <BarChart3 size={18} />
        สถิติ
      </button>
      {showTopicStats && (
        <TopicStatsSheet
          stats={topicStats}
          petStats={{ mathCorrect, scienceCorrect, comboMilestones }}
          onClose={() => setShowTopicStats(false)}
        />
      )}

      {/* 7. expandable detail */}
      {expanded && isMaxStage && hasFullStats && (
        <div className="flex w-full flex-col items-center gap-4 border-t border-border pt-5">
          <div>
            <h2 className="text-sm font-bold text-gold-hi">พลังประจำตัว</h2>
            <p className="text-xs text-text3">จะได้ใช้เมื่อระบบผจญภัย &amp; ต่อสู้เปิดในอนาคต</p>
          </div>
          <StatRadar
            stats={{
              hp: statHp as number,
              atk: statAtk as number,
              def: statDef as number,
              spd: statSpd as number,
              foc: statFoc as number,
            }}
          />
        </div>
      )}
    </div>
  );
}
