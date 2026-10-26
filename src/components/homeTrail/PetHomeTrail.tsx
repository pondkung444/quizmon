"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { BarChart3, ChevronRight, DoorOpen, LayoutGrid, Settings, Trophy, UtensilsCrossed } from "lucide-react";
import type PetCard from "@/components/PetCard";
import SpeechBubble from "@/components/SpeechBubble";
import StatRadar from "@/components/StatRadar";
import EvolutionGlow from "@/components/EvolutionGlow";
import QmonSprite, { type QmonSpriteHandle } from "@/components/QmonSprite";
import WeeklyLeaderboardCard from "@/components/WeeklyLeaderboardCard";
import TopicStatsSheet from "@/components/TopicStatsSheet";
import FeedPetCard from "@/components/FeedPetCard";
import HomeTrailHeader from "@/components/homeTrail/HomeTrailHeader";
import HomeTrailPath from "@/components/homeTrail/HomeTrailPath";
import HomeNowCard from "@/components/homeTrail/HomeNowCard";
import { usePersonalityMessage } from "@/hooks/usePersonalityMessage";
import { useQmonHappyTriggers } from "@/hooks/useQmonHappyTriggers";
import { useSfx } from "@/lib/audio/useSfx";
import { getEvolutionProgress } from "@/lib/evolution";
import { getSpriteSet } from "@/lib/qmonSprites";
import BgmMuteButton from "@/components/audio/BgmMuteButton";
import { applyTrailPreview, buildHomeTrail, type HomeTrailInput, type TrailPreview, type TrailStopId } from "@/lib/homeTrail";
import { track } from "@/lib/analytics";
import { uxFunnelProps } from "@/lib/analyticsContract";

// หน้าแรก /pet ทาง A "เส้นทางวันนี้" (เปิดด้วย HOME_TRAIL_ENABLED=1 ใน pet/page.tsx) — รับ props ชุดเดียวกับ PetCard
// โครงหน้า 3 แบบตามจอ (CSS .ht-* ใน globals.css) — การ์ด "ตอนนี้" render ทุกตำแหน่งแล้วซ่อนด้วย CSS (ไม่กระพริบ)
// ส่วนน้อง (sprite) ยังเลือกตำแหน่งด้วย JS เพราะ sprite หลายตัวพร้อมกันหนักเกินและ Happy ต้องมีตัวเดียว
type Mode = "portrait" | "short" | "wide";
const SHORT_QUERY = "(orientation: landscape) and (max-height: 540px)";
const WIDE_QUERY = "(min-width: 1024px) and (min-height: 541px)";

function subscribeMode(cb: () => void) {
  const lists = [window.matchMedia(SHORT_QUERY), window.matchMedia(WIDE_QUERY)];
  lists.forEach((l) => l.addEventListener("change", cb));
  return () => lists.forEach((l) => l.removeEventListener("change", cb));
}
function readMode(): Mode {
  if (window.matchMedia(SHORT_QUERY).matches) return "short";
  if (window.matchMedia(WIDE_QUERY).matches) return "wide";
  return "portrait";
}

// มือถือตั้ง: การ์ดอยู่บนทางเมื่อมีจุดก่อนหน้าไม่เกินนี้ — เกินกว่านี้ปุ่มหลุดจอแรกที่ 360×640 จึงยกการ์ดขึ้นไว้ใต้หัว
const MAX_STOPS_BEFORE_INLINE_CARD = 2;
const SEEN_KEY = "qm_home_trail_seen";

export type PetHomeTrailProps = ComponentProps<typeof PetCard> & {
  footer?: ReactNode;
  // ?trailPreview= (ไม่ใช่ production — pet/page.tsx กันไว้): ข้อมูลสมมติเฉพาะทางเดิน/การ์ด ไม่ยิง event ปุ่มไม่ทำงาน
  trailPreview?: TrailPreview | null;
};

export default function PetHomeTrail(props: PetHomeTrailProps) {
  const {
    petId, stage, stageName, exp, nickname, speciesName, petImagePath, statHp, statAtk, statDef, statSpd, statFoc,
    mathCorrect, scienceCorrect, comboMilestones, expToday, dailyCap, justEvolved, eggChoices, personalityKey,
    journeyDays, topicStats, mission, hasEverAnswered, myWeeklyRank, gradeBand, foodA, foodB, dungeonCard,
    raidTicketCount, pvpTurnCount, qmonSpriteEnabled = false, spriteDebug = null, spriteFps = null,
    spriteRandomFast = false, spriteQuizHappy = false, footer, trailPreview = null,
  } = props;

  const sfx = useSfx();
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "portrait" as Mode);
  const isMaxStage = stage === 4;
  const advancedUnlocked = dungeonCard.status !== "invite" || isMaxStage;
  const displayName = nickname ?? speciesName ?? stageName;
  const daysPlayedThisWeek = journeyDays.filter((d) => !d.isFuture && d.expEarned > 0).length;

  const trailInput = useMemo<HomeTrailInput>(() => {
    const real: HomeTrailInput = {
        stage,
        exp,
        expToday,
        dailyCap,
        mission: mission
          ? {
              id: mission.mission.id,
              answeredCount: mission.answeredCount,
              correctCount: mission.correctCount,
              target: mission.mission.target_count,
              category: mission.mission.category,
              bonusExp: mission.mission.bonus_exp,
            }
          : null,
        dungeonStatus: dungeonCard.status,
        dungeonName: "dungeon" in dungeonCard ? dungeonCard.dungeon.nameTh : null,
        adventureMinutes: "dungeon" in dungeonCard ? dungeonCard.dungeon.durationMinutes : null,
        raidTicketCount,
        pvpTurnCount,
        advancedUnlocked,
        hasEverAnswered,
        weakTopic: topicStats.needsPractice[0]?.category ?? null,
    };
    return trailPreview ? applyTrailPreview(real, trailPreview) : real;
  }, [stage, exp, expToday, dailyCap, mission, dungeonCard, raidTicketCount, pvpTurnCount, advancedUnlocked, hasEverAnswered, topicStats, trailPreview]);
  const { action, stops, nowId } = useMemo(() => buildHomeTrail(trailInput), [trailInput]);
  // ค่าที่หัว/การ์ดแสดง — ตามพรีวิวถ้ามี (ส่วนรูปน้อง/บุคลิก/ปุ่มอื่นๆ ยังเป็นของจริง)
  const vStage = trailInput.stage;
  const vExp = trailInput.exp;
  const vExpToday = trailInput.expToday;
  const vMission = trailInput.mission;

  // event เดิมของ HomeNextAction — props/source เดิมทุกตัว · การ์ดมีหลายใบ (ซ่อนด้วย CSS) ยิงเฉพาะเมื่อมีใบที่มองเห็นจริง
  // ครั้งเดียวต่อ action.id ต่อการเปิดหน้า (สลับจอทีหลังไม่นับซ้ำ)
  const rootRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (trailPreview || viewedRef.current === action.id) return;
    const cards = rootRef.current?.querySelectorAll<HTMLElement>("[data-now-card]") ?? [];
    if (![...cards].some((el) => el.offsetParent !== null)) return;
    viewedRef.current = action.id;
    track("home_next_action_viewed", uxFunnelProps("active_pet", { activity: action.activity, source: action.id }));
  }, [action.activity, action.id, trailPreview]);
  const trackClick = () =>
    !trailPreview &&
    track("home_next_action_clicked", uxFunnelProps("active_pet", { activity: action.activity, source: action.id }));

  // pop เครื่องหมายถูกของจุดที่เพิ่งเสร็จ (เทียบกับสถานะครั้งก่อนที่เปิดหน้านี้ใน session เดียวกัน)
  const [justDone, setJustDone] = useState<ReadonlySet<TrailStopId>>(new Set());
  useEffect(() => {
    const doneNow = stops.filter((s) => s.status === "done").map((s) => s.id);
    try {
      const prev = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "null") as { petId: string; done: TrailStopId[] } | null;
      if (prev && prev.petId === petId) {
        const fresh = doneNow.filter((id) => !prev.done.includes(id));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน sessionStorage ได้หลัง mount เท่านั้น
        if (fresh.length) setJustDone(new Set(fresh));
      }
      sessionStorage.setItem(SEEN_KEY, JSON.stringify({ petId, done: doneNow }));
    } catch {
      // storage ใช้ไม่ได้ (private mode ฯลฯ) — ข้าม pop ไปเฉยๆ
    }
  }, [stops, petId]);

  // ── น้อง: sprite/รูปนิ่ง + แตะ = ข้อความบุคลิก + Happy + (ระยะ 4) กางพลังประจำตัว — ยกมาจาก PetCard ──
  const evolveSfxRef = useRef(false);
  useEffect(() => {
    if (!justEvolved) return;
    if (!evolveSfxRef.current) {
      evolveSfxRef.current = true;
      sfx("reward_fanfare");
    }
    const url = new URL(window.location.href);
    if (url.pathname === "/pet" && url.searchParams.has("evolved")) {
      url.searchParams.delete("evolved");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [justEvolved, sfx]);

  const [expanded, setExpanded] = useState(false);
  const [tapPulse, setTapPulse] = useState(0);
  const tapRef = useRef<HTMLDivElement>(null);
  const [showTopicStats, setShowTopicStats] = useState(false);
  const { message: personalityMessage, triggerEvent } = usePersonalityMessage(personalityKey);

  const avatarPath = spriteDebug ? `/pets/${spriteDebug.key}.png` : petImagePath;
  const spriteSet = qmonSpriteEnabled && !justEvolved ? getSpriteSet(avatarPath) : null;
  const [spriteReadyKey, setSpriteReadyKey] = useState<string | null>(null);
  const [spriteFailedKey, setSpriteFailedKey] = useState<string | null>(null);
  const useSprite = spriteSet !== null && spriteFailedKey !== spriteSet.key;
  const spriteReady = useSprite && spriteReadyKey === spriteSet.key;
  const spriteRef = useRef<QmonSpriteHandle>(null);
  const happy = useQmonHappyTriggers({
    spriteRef,
    spriteKey: spriteSet?.key ?? null,
    spriteActive: useSprite,
    spriteReady,
    justEvolved,
    fastRandom: spriteRandomFast,
    forceQuizHappy: spriteQuizHappy,
  });
  const cappedToday = expToday >= dailyCap;
  const evolutionProgress = getEvolutionProgress(stage, exp);
  const idleAnimClass = stage === 1 ? "animate-egg-wobble" : "animate-pet-bob";
  const hasFullStats = statHp != null && statAtk != null && statDef != null && statSpd != null && statFoc != null;
  const avatarSize = mode === "wide" ? 230 : mode === "short" ? 108 : 130;

  function onTapQmon() {
    setExpanded((v) => !v);
    setTapPulse((n) => n + 1);
    triggerEvent("tapQmon");
    if (useSprite) {
      happy.onTap();
      const el = tapRef.current;
      if (el) {
        el.classList.remove("animate-pet-tap");
        void el.offsetWidth;
        el.classList.add("animate-pet-tap");
      }
    }
  }

  const avatar = avatarPath ? (
    <button type="button" onClick={onTapQmon} aria-expanded={expanded} aria-label={`แตะ ${displayName}`}>
      <div className={`relative flex items-end justify-center ${!justEvolved && !useSprite ? idleAnimClass : ""}`}>
        <div key={useSprite ? "sprite" : tapPulse} ref={tapRef} className={!useSprite && tapPulse > 0 ? "animate-pet-tap" : ""}>
          <EvolutionGlow progress={evolutionProgress} dailyCapped={cappedToday}>
            {useSprite ? (
              <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
                <Image
                  src={avatarPath}
                  alt="ภาพ Qmon"
                  width={avatarSize}
                  height={avatarSize}
                  priority
                  className={`relative transition-opacity duration-200 ${spriteReady ? "opacity-0" : ""}`}
                />
                <QmonSprite
                  key={spriteSet.key}
                  ref={spriteRef}
                  set={spriteSet}
                  size={avatarSize}
                  visible={spriteReady}
                  loopClip={spriteDebug?.clip}
                  fpsOverride={spriteFps}
                  onReady={() => setSpriteReadyKey(spriteSet.key)}
                  onError={() => setSpriteFailedKey(spriteSet.key)}
                  onHappyReady={happy.onHappyReady}
                  onIdleLoop={happy.onIdleLoop}
                  onHappyEnd={happy.onHappyEnd}
                />
              </div>
            ) : (
              <Image
                src={avatarPath}
                alt="ภาพ Qmon"
                width={avatarSize}
                height={avatarSize}
                priority
                className={`relative ${justEvolved ? "animate-evolve-pop" : ""}`}
              />
            )}
          </EvolutionGlow>
        </div>
      </div>
    </button>
  ) : null;

  const say = personalityMessage ? (
    <div className="ht-say">
      <SpeechBubble message={personalityMessage} />
    </div>
  ) : null;

  const stopsBeforeNow = nowId ? stops.findIndex((s) => s.id === nowId) : -1;
  // ตัดสินจากข้อมูลเท่านั้น (ไม่ขึ้นกับจอ) — มีผลเฉพาะมือถือตั้ง จอเตี้ย/กว้างการ์ดอยู่ฝั่งซ้ายเสมอ
  const cardInline = nowId !== null && stopsBeforeNow <= MAX_STOPS_BEFORE_INLINE_CARD;
  const portraitSlot = cardInline ? "inline" : "top";

  const nowCard = (slot: "top" | "inline" | "side") => {
    // น้องอยู่ในการ์ดใบที่ตรงกับจอ: มือถือตั้ง = ใบบนทาง/ใต้หัว · จอเตี้ย = ใบซ้าย · จอกว้าง = ฉากซ้าย (ไม่อยู่ในการ์ด)
    const holdsAvatar = slot === "side" ? mode === "short" : mode === "portrait";
    return (
      <HomeNowCard
        slot={slot}
        collectAnchor={slot === "side" ? mode !== "portrait" : mode === "portrait"}
        action={action}
        avatar={holdsAvatar ? avatar : null}
        say={holdsAvatar ? say : null}
        mission={action.id === "daily_mission" && vMission ? { answeredCount: vMission.answeredCount, target: vMission.target } : null}
        training={action.id === "train_to_cap" ? { expToday: vExpToday, dailyCap } : null}
        egg={vStage === 1 ? { exp: vExp } : null}
        preview={!!trailPreview}
        eggChoices={eggChoices}
        onCtaClick={trackClick}
      />
    );
  };

  const statsPanel =
    expanded && isMaxStage && hasFullStats ? (
      <div className="ht-stats">
        <div>
          <h2 className="text-sm font-bold">พลังประจำตัว</h2>
          <p className="text-xs" style={{ color: "var(--trail-text3)" }}>
            ได้ใช้จริงตอนเก็บเข้าฟาร์มแล้ว ไปผจญภัยและท้าทายด่านได้เลย
          </p>
        </div>
        <StatRadar stats={{ hp: statHp as number, atk: statAtk as number, def: statDef as number, spd: statSpd as number, foc: statFoc as number }} />
      </div>
    ) : null;

  const rowBody = (icon: ReactNode, title: string, detail: string) => (
    <>
      <span className="ht-mi" aria-hidden>{icon}</span>
      <span className="l">
        <span className="t">{title}</span>
        <span className="d">{detail}</span>
      </span>
      <ChevronRight className="chev" aria-hidden />
    </>
  );

  return (
    <div className="ht ht-intro" ref={rootRef}>
      <div className="ht-grid">
        <aside className="ht-side">
          <HomeTrailHeader
            displayName={displayName}
            stage={vStage}
            exp={vExp}
            petImagePath={petImagePath}
            daysPlayedThisWeek={daysPlayedThisWeek}
          />
          {mode === "wide" && (
            <div className="ht-art">
              {say}
              <div className="ht-q">{avatar}</div>
            </div>
          )}
          <div className="ht-vis-two">
            {nowCard("side")}
            {statsPanel}
          </div>
        </aside>

        <section aria-labelledby="ht-trail-title">
          {!cardInline && <div className="ht-top-now ht-vis-portrait">{nowCard("top")}</div>}
          {/* ปุ่มเพลงอยู่ขวาสุดของแถวหัวข้อ (ไม่ fixed) — ไม่ลอยทับทางเดิน เฉพาะหน้านี้ หน้าอื่นคงเดิม */}
          <div className="ht-title-row">
            <h2 id="ht-trail-title" className="ht-title ht-title-trail">
              เส้นทางวันนี้{trailPreview ? ` (พรีวิว: ${trailPreview})` : ""}
            </h2>
            <BgmMuteButton className="mt-2 shrink-0" />
          </div>
          <HomeTrailPath stops={stops} nowSlot={portraitSlot === "inline" ? nowCard("inline") : null} justDone={justDone} />
          <div className="ht-vis-portrait">{statsPanel}</div>

          <h2 className="ht-title">อื่นๆ</h2>
          <ul className="ht-more">
            <li>
              <WeeklyLeaderboardCard
                myWeeklyRank={myWeeklyRank}
                gradeBand={gradeBand}
                renderTrigger={(open, text) =>
                  open ? (
                    <button type="button" className="ht-row" onClick={open} aria-haspopup="dialog">
                      {rowBody(<Trophy />, "อันดับสัปดาห์นี้", `${text.headline} · ${text.subline}`)}
                    </button>
                  ) : (
                    <div className="ht-row">{rowBody(<Trophy />, "อันดับสัปดาห์นี้", text.subline)}</div>
                  )
                }
              />
            </li>
            <li>
              <button type="button" className="ht-row" onClick={() => setShowTopicStats(true)}>
                {rowBody(<BarChart3 />, "บทที่ถนัด", "ดูว่าบทไหนแม่นแล้ว บทไหนควรฝึกเพิ่ม")}
              </button>
            </li>
            {!isMaxStage && foodA + foodB > 0 && (
              <li>
                <FeedPetCard
                  petId={petId}
                  initialFoodA={foodA}
                  initialFoodB={foodB}
                  renderTrigger={(open, total) => (
                    <button type="button" className="ht-row" onClick={open}>
                      {rowBody(<UtensilsCrossed />, "ป้อนอาหาร", `มี ${total} ชิ้น · ใช้กำหนดบุคลิกตอนโตครบ`)}
                    </button>
                  )}
                />
              </li>
            )}
            <li>
              {/* 2048 เป็นหน้า static (public/2048) — <a> ธรรมดาเหมือน Forest2048Entry */}
              <a href="/2048/" className="ht-row">
                {rowBody(<LayoutGrid />, "2048 ผู้พิทักษ์ผลึก", "เกมเสริม มีอันดับ")}
              </a>
            </li>
            <li>
              <Link href="/classroom/join" className="ht-row" onClick={() => sfx("tap")}>
                {rowBody(<DoorOpen />, "เข้าห้องเรียน", "ใส่รหัสห้องจากครู")}
              </Link>
            </li>
            <li>
              <Link href="/settings" className="ht-row" onClick={() => sfx("tap")}>
                {rowBody(<Settings />, "ตั้งค่า", "ธีม เสียง และบัญชี")}
              </Link>
            </li>
          </ul>
          {footer && <div className="ht-footer">{footer}</div>}
        </section>
      </div>

      {showTopicStats && (
        <TopicStatsSheet
          stats={topicStats}
          petStats={{ mathCorrect, scienceCorrect, comboMilestones }}
          onClose={() => setShowTopicStats(false)}
        />
      )}
    </div>
  );
}
