"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, DoorOpen, Settings } from "lucide-react";
import CollectPetButton from "@/components/CollectPetButton";
import type { EggChoice } from "@/components/EggChoiceModal";
import StatRadar from "@/components/StatRadar";
import SpeechBubble from "@/components/SpeechBubble";
import QmonChatBubble from "@/components/QmonChatBubble";
import { usePersonalityMessage } from "@/hooks/usePersonalityMessage";
import type { PersonalityKey } from "@/lib/personality";
import { getEvolutionProgress, STAGE_LABEL_TH } from "@/lib/evolution";
import EvolutionGlow from "@/components/EvolutionGlow";
import { useSfx } from "@/lib/audio/useSfx";
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
import { activityTileClass, ActivityTileContent } from "@/components/ActivityTile";
import HomeNextAction from "@/components/HomeNextAction";
import QmonGrowthGuide from "@/components/QmonGrowthGuide";
import { resolveNextAction } from "@/lib/nextAction";

// ประกายในฉาก Qmon — ตำแหน่งตายตัว (ไม่สุ่ม กัน hydration mismatch ระหว่าง server/client)
const SCENE_SPARKS = [
  { left: "14%", top: "30%", size: 6, delay: "0s" },
  { left: "82%", top: "46%", size: 6, delay: "0.6s" },
  { left: "28%", top: "62%", size: 4, delay: "1.2s" },
  { left: "70%", top: "24%", size: 4, delay: "1.8s" },
  { left: "8%", top: "54%", size: 5, delay: "0.9s" },
  { left: "90%", top: "70%", size: 4, delay: "1.5s" },
];


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

  const displayName = nickname ?? speciesName ?? stageName;
  // ผจญภัย/ท้าทายเปิดเมื่อมี Qmon stage 4 ในฟาร์มแล้ว หรือตัวที่เลี้ยงอยู่โตเต็มที่
  const advancedUnlocked = dungeonCard.status !== "invite" || isMaxStage;
  // ชิปหัวการ์ด: นับวันที่ได้ EXP จริงในสัปดาห์นี้ (ข้อมูลเดียวกับหน้า /pet/calendar) — ไม่ใช่ streak ข้ามสัปดาห์
  const daysPlayedThisWeek = journeyDays.filter((d) => !d.isFuture && d.expEarned > 0).length;

  // ธีมหน้า /pet (2026-09): เลิกเป็นการ์ดใหญ่ใบเดียว เปลี่ยนเป็นบล็อกแยก โดยให้ Qmon ในฉากเป็นสิ่งแรก
  // ที่เห็น ตามด้วยแถบวิวัฒนาการ → CTA หลัก (HomeNextAction) ยังอยู่ใน fold แรกบนจอ 667px
  // สีทุกชิ้นมาจาก token ที่ธีมสลับให้ (globals.css [data-app-theme])
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      {/* 1. หัว: ชื่อ + ระยะ + ชิปสัปดาห์ (กดไปปฏิทินเต็ม) */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="min-w-0 text-left">
          <h2 className="font-sarabun truncate text-lg font-bold leading-tight text-text">{displayName}</h2>
          <p className="text-xs text-text3">
            ระยะ {stage} · {stageName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/pet/calendar")}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-gold-dim bg-card px-3 text-xs font-bold text-gold-hi shadow-sm transition active:scale-95"
        >
          <CalendarDays size={14} aria-hidden />
          {daysPlayedThisWeek > 0 ? `สัปดาห์นี้เล่น ${daysPlayedThisWeek} วัน` : "ดูสัปดาห์นี้"}
        </button>
      </div>

      {/* 2. ฉาก Qmon: ท้องฟ้า + เนิน + แท่นเรืองแสง + ประกาย (.pet-scene* ใน globals.css)
          แตะน้อง = เด้ง + ข้อความตามบุคลิก + (stage 4) กางพลังประจำตัวด้านล่าง เหมือนเดิม
          QmonChatBubble ต้องเป็น sibling ของปุ่มน้อง ไม่ใช่ลูก (ปุ่มซ้อนปุ่มทำ hydration พัง) */}
      <div className="pet-scene relative h-[248px] w-full overflow-hidden rounded-3xl shadow-lg">
        <span className="pet-scene-ground" aria-hidden />
        <span className="pet-scene-platform" aria-hidden />
        {SCENE_SPARKS.map((s, i) => (
          <span
            key={i}
            className="pet-spark"
            aria-hidden
            style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
          />
        ))}
        <span className="absolute left-3 top-3 z-10 rounded-full bg-(--pet-badge-bg) px-2.5 py-1 text-[11px] font-bold text-(--pet-badge-text) shadow-sm">
          ⭐ ระยะ {stage}
        </span>
        {personalityMessage && (
          <div className="absolute right-3 top-3 z-20 text-left">
            <SpeechBubble message={personalityMessage} />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setExpanded((v) => !v);
            setTapPulse((n) => n + 1);
            triggerPersonalityEvent("tapQmon");
          }}
          className="absolute inset-x-0 bottom-[26px] mx-auto flex h-[190px] w-[200px] items-end justify-center"
          aria-expanded={expanded}
          aria-label={`แตะ ${displayName}`}
        >
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
        <div className="absolute bottom-4 right-4 h-12 w-12">
          <QmonChatBubble />
        </div>
      </div>

      {/* 3. แถบวิวัฒนาการ — segmented 1 ช่อง = 1 ระยะ (ดู evolutionSegments ด้านบน) หนาขึ้น + ไล่สี +
          แสงวิ่งเฉพาะช่องระยะปัจจุบัน + ชื่อระยะใต้แต่ละช่อง */}
      <div className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-sm">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-bold text-text">✨ พลังวิวัฒนาการ</span>
          <span className="text-text3">
            {nextThreshold !== undefined
              ? `อีก ${Math.max(0, nextThreshold - exp)} แต้มจะโต!`
              : "โตเต็มที่แล้ว! เก่งมาก 🎉"}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {evolutionSegments.map((fill, i) => (
            <div key={i} className="h-4 flex-1 overflow-hidden rounded-full bg-track">
              {fill > 0 && (
                <div
                  className={`h-full rounded-full bg-(image:--pet-evo-fill) transition-all ${i + 1 === stage ? "pet-bar-fill" : ""}`}
                  style={{ width: `${fill * 100}%` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[10px]">
          {[1, 2, 3, 4].map((s) => (
            <span key={s} className={s === stage ? "font-bold text-text" : "text-text3"}>
              {STAGE_LABEL_TH[s].name}
            </span>
          ))}
        </div>
        <QmonGrowthGuide
          stage={stage}
          exp={exp}
          dailyCap={dailyCap}
          advancedActivitiesUnlocked={advancedUnlocked}
        />
      </div>

      {/* 4. CTA หลักเพียงจุดเดียว (สีสดที่สุดของหน้า ดู --hero-* ใน globals.css) */}
      <HomeNextAction
        action={nextAction}
        learnerState="active_pet"
        advancedActivitiesUnlocked={advancedUnlocked}
      />

      {/* control ที่ต้องทำงานในหน้าเดิม (เก็บ Qmon) และ mission chip ที่จบแล้วคงไว้เป็นสถานะรอง */}
      {isMaxStage ? (
        <div id="collect-qmon" className="w-full scroll-mt-24"><CollectPetButton eggChoices={eggChoices} /></div>
      ) : !missionActive ? (
        <MissionCard mission={mission} subline={subline} />
      ) : null}

      {/* 5. พลังวันนี้ */}
      <div className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--pet-zap-bg) text-lg" aria-hidden>
            ⚡
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-bold text-text">พลังวันนี้</span>
              <span className="text-text3">
                {Math.min(expToday, dailyCap)} / {dailyCap} แต้ม
              </span>
            </div>
            <div className="mt-1.5 h-3.5 w-full overflow-hidden rounded-full bg-track">
              {dailyProgress > 0 && (
                <div
                  className="pet-bar-fill h-full rounded-full bg-(image:--pet-daily-fill) transition-all"
                  style={{ width: `${dailyProgress * 100}%` }}
                />
              )}
            </div>
            {expToday <= 0 && <p className="mt-1 text-[11px] text-text3">ตอบคำถามเพื่อเติมพลังให้น้องวันนี้</p>}
          </div>
        </div>
        {cappedToday && (
          <p className="mt-2 rounded-xl border border-amber-dim bg-amber/10 p-2 text-xs text-amber">
            น้องอิ่มความรู้แล้ววันนี้ พรุ่งนี้มาฝึกต่อนะ
          </p>
        )}
      </div>

      {/* 6. กิจกรรม (จัดใหม่ 2026-09) — การ์ดผจญภัยเต็มความกว้างเป็นจุดเดียวของผจญภัย (เดิมมีไทล์
          ผจญภัยแยกที่บอกเวลาซ้ำกับการ์ดฉาก) ตามด้วยไทล์สีขนาดเท่ากันใน grid เดียว จำนวนคอลัมน์ตามไทล์
          ที่มีจริง (auto-cols-fr): ท้าทาย (เมื่อปลดล็อก) / ป้อนอาหาร (ก่อน stage 4 และมีอาหารในคลัง —
          กัน dead-end "มี 0 ชิ้น") / สถิติ (เสมอ) — แถบปฏิทินสัปดาห์เอาออก ดูได้จากชิปหัวการ์ด */}
      <section aria-labelledby="pet-activities-title" className="flex w-full flex-col gap-2 text-left">
        <h2 id="pet-activities-title" className="px-1 text-sm font-bold text-text">
          กิจกรรม
        </h2>
        {advancedUnlocked && <DungeonAdventureCard state={dungeonCard} />}
        <div className="grid w-full auto-cols-fr grid-flow-col gap-2">
          {advancedUnlocked && (
            <Link href="/raid" onClick={() => sfx("tap")} className={activityTileClass("raid")}>
              <ActivityTileContent icon="⚔️" title="ท้าทาย" subtitle={`กุญแจ ${raidTicketCount} ดอก`} />
            </Link>
          )}
          {!isMaxStage && foodA + foodB > 0 && (
            <FeedPetCard petId={petId} initialFoodA={foodA} initialFoodB={foodB} variant="tile" />
          )}
          <button type="button" onClick={() => setShowTopicStats(true)} className={activityTileClass("stats")}>
            <ActivityTileContent icon="📊" title="สถิติ" subtitle="ดูบทที่ถนัด" />
          </button>
        </div>
      </section>

      {/* 7. อันดับสัปดาห์ */}
      <WeeklyLeaderboardCard myWeeklyRank={myWeeklyRank} gradeBand={gradeBand} />

      {/* 8. ลิงก์ที่ใช้ไม่บ่อย — ตัวเล็กแต่ touch target ยัง 44px */}
      <div className="flex items-center justify-center gap-1 text-xs text-text3">
        <Link href="/classroom/join" className="flex min-h-11 items-center gap-1.5 px-3 transition active:opacity-70">
          <DoorOpen size={15} aria-hidden />
          เข้าห้องเรียน
        </Link>
        <span aria-hidden>·</span>
        <Link href="/settings" className="flex min-h-11 items-center gap-1.5 px-3 transition active:opacity-70">
          <Settings size={15} aria-hidden />
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

      {/* 9. expandable detail */}
      {expanded && isMaxStage && hasFullStats && (
        <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-border bg-card p-4">
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
