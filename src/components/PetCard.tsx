"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BarChart3, Settings, Swords } from "lucide-react";
import CollectPetButton from "@/components/CollectPetButton";
import type { EggChoice } from "@/components/EggChoiceModal";
import StatRadar from "@/components/StatRadar";
import SpeechBubble from "@/components/SpeechBubble";
import QmonChatBubble from "@/components/QmonChatBubble";
import { usePersonalityMessage } from "@/hooks/usePersonalityMessage";
import type { PersonalityKey } from "@/lib/personality";
import { getEvolutionProgress } from "@/lib/evolution";
import EvolutionGlow from "@/components/EvolutionGlow";
import { useSfx } from "@/lib/audio/useSfx";
import WeeklyJourneyCard from "@/components/WeeklyJourneyCard";
import type { JourneyDay } from "@/lib/weeklyJourney";
import WeeklyLeaderboardCard from "@/components/WeeklyLeaderboardCard";
import type { MyWeeklyRank } from "@/lib/weeklyLeaderboard";
import type { GradeBand } from "@/lib/gradeBand";
import TopicStatsSheet from "@/components/TopicStatsSheet";
import type { TopicStatsResult } from "@/lib/topicStats";
import MissionCard from "@/components/MissionCard";
import type { TodayMissionResult } from "@/lib/missions";
import type { Subline } from "@/lib/evolution";
import FeedPetCard from "@/components/FeedPetCard";
import DungeonAdventureCard from "@/components/DungeonAdventureCard";
import type { DungeonCardState } from "@/lib/dungeon";
import StickyActionBanner from "@/components/StickyActionBanner";
import HomeNextAction from "@/components/HomeNextAction";
import QmonGrowthGuide from "@/components/QmonGrowthGuide";
import { resolveNextAction } from "@/lib/nextAction";


export default function PetCard({
  petId,
  stage,
  stageName,
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
  hasEverAnswered,
  myWeeklyRank,
  gradeBand,
  subline,
  foodA,
  foodB,
  dungeonCard,
  raidTicketCount,
  pvpTurnCount,
}: {
  petId: string;
  stage: number;
  stageName: string;
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
  hasEverAnswered: boolean;
  myWeeklyRank: MyWeeklyRank;
  gradeBand: GradeBand | null;
  subline: Subline | null;
  foodA: number;
  foodB: number;
  dungeonCard: DungeonCardState;
  raidTicketCount: number;
  pvpTurnCount: number;
}) {
  const router = useRouter();
  const sfx = useSfx();
  const evolveSfxRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [tapPulse, setTapPulse] = useState(0);
  const [showTopicStats, setShowTopicStats] = useState(false);
  // ปุ่มถาวรเปิด feedback popup เอง — คนละกลไกกับ auto-trigger หลังภารกิจใน QuizClient.tsx (ไม่เช็ค
  // ADMIN_EMAILS/เคยตอบไปหรือยัง เปิดได้ไม่จำกัดจำนวนครั้ง)
  const { message: personalityMessage, triggerEvent: triggerPersonalityEvent } =
    usePersonalityMessage(personalityKey);

  useEffect(() => {
    if (!justEvolved) return;
    // ยิงเสียงฉลองครั้งเดียว (ref กัน effect re-run / StrictMode double-invoke)
    if (!evolveSfxRef.current) {
      evolveSfxRef.current = true;
      sfx("reward_fanfare");
    }
    // Clear the URL marker on mount, before the next CTA navigation begins.
    // The CSS celebration runs independently; delayed history updates can cancel it.
    const url = new URL(window.location.href);
    if (url.pathname === "/pet" && url.searchParams.has("evolved")) {
      url.searchParams.delete("evolved");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [justEvolved, sfx]);

  const isMaxStage = stage === 4;
  const cappedToday = expToday >= dailyCap;
  const dailyProgress = Math.min(1, dailyCap > 0 ? expToday / dailyCap : 1);
  // Daily missions lead for every player, including a newly hatched Qmon.
  const missionActive =
    !!mission && mission.answeredCount < mission.mission.target_count;

  const missionRemaining = mission
    ? Math.max(0, mission.mission.target_count - mission.answeredCount)
    : 0;
  const nextAction = resolveNextAction({
    hasPet: true,
    evolutionReady: isMaxStage,
    mission: missionActive && mission
      ? { id: mission.mission.id, remaining: missionRemaining, bonusExp: mission.mission.bonus_exp }
      : null,
    adventureStatus: dungeonCard.status,
    adventureMinutes: "dungeon" in dungeonCard ? dungeonCard.dungeon.durationMinutes : null,
    pvpTurnCount,
    raidTicketCount,
    advancedActivitiesUnlocked: dungeonCard.status !== "invite" || isMaxStage,
    expToday,
    dailyExpCap: dailyCap,
    hasEverAnswered,
    weakTopic: topicStats.needsPractice[0]?.category ?? null,
  });

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
      <WeeklyLeaderboardCard myWeeklyRank={myWeeklyRank} gradeBand={gradeBand} />

      {/* 1.6 แถบด่วนผจญภัย/ท้าทาย — sticky ค้างบนสุดตอนเลื่อนผ่าน (11 ส.ค. 2026 เปิดระบบท้าทาย)
          ดู StickyActionBanner.tsx */}
      {(dungeonCard.status !== "invite" || isMaxStage) && (
        <StickyActionBanner dungeonCard={dungeonCard} raidTicketCount={raidTicketCount} />
      )}

      {/* 2. nameplate — เปลี่ยนจากทรงเพชร (หมุน 45°) เป็นแคปซูล/pill (ux pass 2026-07 รอบ 3)
          เหตุผล: เพชรใช้พื้นที่แนวตั้งไม่คุ้ม (มุมทั้ง 4 เสียเปล่า ต้องสูงถึง 64px เพื่อใส่ข้อความ
          บรรทัดเดียวที่จริงสูงแค่ ~14px) พอเปลี่ยนเป็น pill เหลือแค่ ~36px — ได้พื้นที่คืนอีก ~24-28px
          ช่วยลด scroll เคส mission-active ที่ยังเหลืออยู่ ไม่ต้องมี whitespace-nowrap hack กันตัดมุม
          อีกต่อไปเพราะไม่มีมุมให้ตัดแล้ว — เปลี่ยนพร้อมกันทั้ง CollectedPetCard.tsx (/collection) ด้วย
          เพื่อความสม่ำเสมอ ตามที่ปอนด์เลือก (ทางเลือกที่ 2 จาก 3 ตัวเลือกที่เสนอไป) */}
      <div className="flex h-9 items-center justify-center rounded-full border-2 border-gold bg-track px-4">
        <span className="font-sarabun whitespace-nowrap text-xs font-bold text-gold-hi">
          {nickname ?? speciesName ?? stageName}
        </span>
      </div>

      {/* 3. avatar (click to expand) — ห่อด้วย wrapper "relative" แยกจากปุ่ม avatar เอง เพื่อวาง
          QmonChatBubble เป็น badge ติดมุมล่างขวาของกรอบนี้ (ต้องเป็น sibling ของปุ่ม ไม่ใช่ลูกของมัน
          เพราะ QmonChatBubble มี <button> ของตัวเอง — ปุ่มซ้อนปุ่มผิด HTML ทำให้ hydration พัง) */}
      <div className="relative">
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
        <QmonChatBubble />
      </div>

      <HomeNextAction
        action={nextAction}
        learnerState="active_pet"
        advancedActivitiesUnlocked={dungeonCard.status !== "invite" || isMaxStage}
      />

      {/* Hero ด้านบนเป็น CTA หลักเพียงจุดเดียว ส่วน control ที่ต้องทำงานในหน้าเดิม
          (เก็บ Qmon) และ mission chip ที่จบแล้วคงไว้เป็นสถานะรอง ไม่แย่งลำดับการตัดสินใจ */}
      {isMaxStage ? (
        <div id="collect-qmon" className="w-full scroll-mt-24"><CollectPetButton eggChoices={eggChoices} /></div>
      ) : !missionActive ? (
        <MissionCard mission={mission} subline={subline} />
      ) : null}

      {/* ── จบ fold แรกที่ตั้งใจ (journey strip -> nameplate -> avatar -> CTA) ── */}

      {/* 5. exp -> next stage — segmented bar, 1 ช่อง = 1 ระยะ (ดู evolutionSegments ด้านบน)
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
        <QmonGrowthGuide
          stage={stage}
          exp={exp}
          dailyCap={dailyCap}
          advancedActivitiesUnlocked={dungeonCard.status !== "invite" || isMaxStage}
        />
      </div>

      {/* 6. daily training bar */}
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

      {/* ของรองด้านล่างนี้ไม่ต้องตัดสินใจอะไรวันนี้ ไม่จำเป็นต้องอยู่บนสุด: */}

      {/* 6.6 ป้อนอาหาร — เฉพาะก่อน stage 4 และเฉพาะตอนมีอาหารในคลังจริง (กัน dead-end กดเข้าไป
          แล้วเจอ "มี 0 ชิ้น" — หลักเดียวกับ mission chip: สถานะที่ไม่รอ action ไม่ควรกินที่) */}
      {!isMaxStage && foodA + foodB > 0 && (
        <FeedPetCard petId={petId} initialFoodA={foodA} initialFoodB={foodB} />
      )}

      {/* 6.65 การ์ดผจญภัย — ใต้บล็อกป้อนอาหาร (ux pass 2026-08) ดู DungeonAdventureCard.tsx
          สำหรับ 4 สถานะ (invite/ready/traveling/claimable) */}
      {(dungeonCard.status === "traveling" || dungeonCard.status === "claimable") && (
        <DungeonAdventureCard state={dungeonCard} />
      )}

      {/* 6.7 ปุ่มเปิดสถิติแยกบท — ขยาย touch target เป็น 44px + ใส่ label (เดิม 32px icon ล้วน
          ต่ำกว่ามาตรฐาน touch target และไม่มีคำกำกับ ซึ่งไม่เหมาะกับกลุ่มเป้าหมายเด็ก)
          "ขอแรงใจ" ย้ายออกจากแถวนี้ไปเป็น floating chat bubble แล้ว (ดู QmonChatBubble.tsx —
          จับคู่ผิดกลุ่มกับปุ่ม "สถิติ" ที่เป็น data view ไม่ใช่การคุยกับสัตว์เลี้ยง) */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowTopicStats(true)}
          className="flex h-11 items-center gap-2 rounded-full border border-gold-dim bg-track px-4 text-sm font-medium text-text2 transition active:scale-95"
        >
          <BarChart3 size={18} />
          สถิติ
        </button>
        <Link
          href="/boss-raid/join"
          className="flex h-11 items-center gap-2 rounded-full border border-gold-dim bg-track px-4 text-sm font-medium text-text2 transition active:scale-95"
        >
          <Swords size={18} />
          เข้าห้อง
        </Link>
        <Link
          href="/settings"
          className="flex h-11 items-center gap-2 rounded-full border border-gold-dim bg-track px-4 text-sm font-medium text-text2 transition active:scale-95"
        >
          <Settings size={18} />
          ตั้งค่า
        </Link>
      </div>
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
            <p className="text-xs text-text3">พลังพวกนี้จะได้ใช้จริงตอนเก็บเข้าฟาร์มแล้ว — ไปผจญภัยและท้าทายด่านต่างๆ ได้เลย</p>
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
