"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  useBossRaidTv,
  type TvRankedParticipant,
  type TvSession,
} from "@/lib/bossRaid/useBossRaidTv";
import type { ParticipantDisplay } from "@/lib/bossRaid/participantDisplay";

// จอทีวี Boss Raid — layout/พฤติกรรมอ้างจาก mockup v9 (docs/boss-raid-mockups/boss-raid-tv-screen-mockup-v9.html)
// ทุกตำแหน่งคุมด้วยโค้ดเป็น % ของกล่องฉาก 16:9 ไม่ผูกกับพิกเซลในภาพพื้นหลัง
// ข้อมูล + transient animation state ทั้งหมดมาจาก useBossRaidTv (realtime จริง) — component นี้ render อย่างเดียว

const BG_SRC = "/raid/boss_raid_scene_open_field.webp";
// ⚠️ DRAFT — ตัดพื้นขาวด้วย automated threshold ยังไม่ production-grade (§2.4 ของ handoff + ชื่อไฟล์)
// ห้าม promote เป็น asset จริงจนกว่าปอนด์จะส่งไฟล์ตัดขอบที่ผ่านตาจริง
const CRYSTAL_SRC = "/raid/boss_raid_crystal_DRAFT_autocut.png";
// schema ยังไม่มี field เลือกสายพันธุ์บอส (start_boss_raid_game ไม่เคยเซ็ต boss identity) — ใช้ตัวเดียวคงที่
const BOSS_SRC = "/raid/boss_ridge_mist.png";
const BOSS_ASPECT = 1024 / 1536; // boss_ridge_mist.png — ตรงกับ SPRITE_ASPECT_RATIO ใน spriteGroundOffsets.ts

// Qmon ของ top-5 มาจาก roster (get_boss_raid_participant_display -> resolveParticipantSprite ผ่าน
// petImage.ts) — อันนี้เป็นแค่ fallback ต่อ "ช่องอันดับ" เผื่อ resolve ไม่ได้ (pet ต่ำกว่า stage 3
// ที่ยังไม่มี subline/personality, stage นอกช่วง ฯลฯ) ให้ยังเห็น sprite ต่างกันต่อ slot ไม่ใช่ช่องว่าง
const FALLBACK_SPRITES = [
  "/pets/egg1_stage4_balance_A.png",
  "/pets/egg2_stage4_balance_A.png",
  "/pets/egg3_stage4_balance_A.png",
  "/pets/egg4_stage4_balance_A.png",
  "/pets/egg5_stage4_balance_A.png",
];

// แนวป้องกันหน้าคริสตัล — rank1 (total_damage สูงสุด) หน้าสุดในกลุ่ม (bottom % น้อย = ใกล้กล้อง = ใหญ่)
const FORMATION = [
  { left: 36, bottom: 8, w: 10.0 },
  { left: 20, bottom: 13, w: 8.6 },
  { left: 50, bottom: 15, w: 8.2 },
  { left: 12, bottom: 20, w: 7.2 },
  { left: 58, bottom: 22, w: 7.0 },
];

const TIER_TH: Record<string, string> = { light: "เบา", medium: "กลาง", heavy: "แรง" };

// active_event.expires_at เก็บเป็น (now() + interval 'N seconds')::text ฝั่ง DB — รูปแบบ
// "2026-09-02 06:15:30.123+00" (space คั่น, offset "+00" ไม่ใช่ "+00:00") ซึ่งไม่ใช่ ISO เป๊ะ
// บาง engine parse ไม่ได้ -> คืน NaN -> event ไม่โชว์ทั้งที่ยัง active. normalize ก่อน parse
function tsMs(s: string): number {
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.parse(s.replace(" ", "T")) : t;
}

function liveEvent(session: TvSession, now: number): TvSession["active_event"] {
  const e = session.active_event;
  if (!e) return null;
  return tsMs(e.expires_at) > now ? e : null;
}

export default function TvClient({
  sessionId,
  initialSession,
  initialTopFive,
  initialParticipantCount,
  initialRoster,
}: {
  sessionId: string;
  initialSession: TvSession;
  initialTopFive: TvRankedParticipant[];
  initialParticipantCount: number;
  initialRoster: Record<string, ParticipantDisplay>;
}) {
  const {
    session,
    topFive,
    participantCount,
    roster,
    ticker,
    combo,
    comboBump,
    heroAttackRank,
    bossFlash,
    floats,
    litDots,
    spotlight,
    rewards,
    connected,
  } = useBossRaidTv(sessionId, {
    session: initialSession,
    topFive: initialTopFive,
    participantCount: initialParticipantCount,
    roster: initialRoster,
  });

  const s = session ?? initialSession;
  const [now, setNow] = useState(() => Date.now());

  // ticking clock — เดินเฉพาะตอนมี event ที่ต้องนับถอยหลัง (ประหยัด render)
  useEffect(() => {
    if (!s.active_event) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [s.active_event]);

  const activeEvent = liveEvent(s, now);
  const weakPointLive = activeEvent?.type === "weak_point";
  const meteorLive = activeEvent?.type === "meteor";

  const bossHp = s.boss_hp ?? 0;
  const bossHpMax = s.boss_hp_max ?? 0;
  const crystalHp = s.crystal_hp ?? 0;
  const crystalHpMax = s.crystal_hp_max ?? 0;
  const crystalFrac = crystalHpMax > 0 ? Math.max(0, Math.min(1, crystalHp / crystalHpMax)) : 1;
  const teamPct = bossHpMax > 0 ? Math.min(85, 55 + (1 - bossHp / bossHpMax) * 30) : 55;

  // บอสขยับเข้าใกล้/ใหญ่ตาม HP คริสตัลที่ลด (สูตรจาก updateBossPosition() ของ mockup)
  const bossRight = -2 + crystalFrac * 8;
  const bossBottom = 6 + crystalFrac * 5;
  const bossWidth = 30 - crystalFrac * 6;

  const weakPointPct =
    weakPointLive && activeEvent
      ? Math.max(0, Math.min(100, ((tsMs(activeEvent.expires_at) - now) / 20000) * 100))
      : 100;
  const meteorRemain =
    meteorLive && activeEvent
      ? Math.max(0, Math.ceil((tsMs(activeEvent.expires_at) - now) / 1000))
      : 0;

  const litSet = useMemo(() => new Set(litDots), [litDots]);
  const ended = s.status === "ended" && s.result;
  const shownTicker = useMemo(() => ticker.slice(-3).reverse(), [ticker]);

  return (
    // fixed inset-0 z-50 = เต็มจอจริง ทับ BottomNav ของ layout (จอโปรเจกเตอร์ ไม่ใช่หน้าแอปปกติ)
    // — วิธีเดียวกับ RaidBossScreen.tsx กล่องฉากเป็น 16:9 letterbox กลางจอ กว้างไม่เกิน 1600px และ
    // ไม่บังคับให้สูงเกิน viewport (177.78vh = 100vh * 16/9)
    <main className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black">
      <div className="relative aspect-video w-[min(1600px,177.78vh)] max-w-full overflow-hidden">
        <Image src={BG_SRC} alt="" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30" />

        {/* ===== HUD ===== */}
        <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-[1%] px-[3%] py-[2%]">
          <span className="whitespace-nowrap text-[clamp(11px,1.15vw,15px)] font-medium text-white drop-shadow">
            ห้อง {s.join_code}
            {!connected && <span className="ml-2 text-white/60">· กำลังเชื่อมต่อ…</span>}
          </span>
          <div className="flex h-[1.8vw] max-h-[22px] min-w-[16%] flex-1 overflow-hidden rounded-full border-[1.5px] border-white/40 bg-black/40">
            <div
              className="bg-gradient-to-r from-[#52d9d4] to-[#bff5f0] transition-[width] duration-500"
              style={{ width: `${teamPct}%` }}
            />
            <div className="w-[3px] bg-white/80" />
            <div className="flex-1 bg-gradient-to-r from-[#ffb37a] to-[#ff6a4d]" />
          </div>
          <span className="whitespace-nowrap rounded-full border-[1.5px] border-[rgba(255,182,72,.6)] bg-[rgba(255,182,72,.25)] px-[1.2%] py-[.4%] text-[clamp(10px,1vw,13px)] font-medium text-gold-hi">
            ● บอสระดับ{TIER_TH[s.current_tier ?? "light"] ?? "เบา"}
          </span>
          <span className="whitespace-nowrap rounded-full border-[1.5px] border-white/40 bg-black/45 px-[1.2%] py-[.4%] text-[clamp(10px,1vw,13px)] text-white">
            ผิดสะสม {s.wrong_count_total ?? 0}
          </span>
          <span className="whitespace-nowrap rounded-full border-[1.5px] border-white/40 bg-white/15 px-[1.2%] py-[.4%] text-[clamp(10px,1vw,13px)] text-white">
            ท็อป 5 จาก {participantCount} คน
          </span>
          {combo > 1 && (
            <span
              key={comboBump}
              className="animate-br-tv-combo-pulse whitespace-nowrap rounded-full border-[1.5px] border-[rgba(255,106,77,.6)] bg-[rgba(255,106,77,.2)] px-[1.2%] py-[.4%] text-[clamp(10px,1vw,13px)] font-bold text-[#ffb37a]"
            >
              🔥 คอมโบ x{combo}
            </span>
          )}
        </div>

        {/* ===== weak point banner + countdown ===== */}
        {weakPointLive && (
          <>
            <div className="absolute left-1/2 top-[12%] z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[rgba(255,209,102,.92)] to-[rgba(255,182,72,.92)] px-[2.2%] py-[.7%] text-[clamp(10px,1vw,13px)] font-bold text-[#3a2a06]">
              ✦ จุดอ่อนเผย! ดาเมจ ×2
            </div>
            <div className="absolute left-1/2 top-[17.5%] z-30 w-[26%] -translate-x-1/2">
              <div className="h-[.85vw] max-h-[11px] overflow-hidden rounded-full border-[1.5px] border-[rgba(255,209,102,.5)] bg-black/45">
                <div
                  className="h-full bg-gradient-to-r from-[#ffd166] to-[#ff6a4d] transition-[width] duration-200 ease-linear"
                  style={{ width: `${weakPointPct}%` }}
                />
              </div>
            </div>
          </>
        )}

        {/* ===== field ===== */}
        <div className="absolute inset-0 z-10">
          {/* คริสตัล — ลอยอิสระซ้ายจอ (asset มีแท่นในตัว) */}
          <div className="absolute flex flex-col items-center" style={{ left: "5%", bottom: "18%", width: "10%" }}>
            <div className="relative w-full" style={{ aspectRatio: 1 }}>
              <Image src={CRYSTAL_SRC} alt="คริสตัลฐาน" fill sizes="20vw" className="object-contain drop-shadow-xl" />
            </div>
            <div className="mt-[.4vw] whitespace-nowrap rounded-md bg-[rgba(15,12,34,.72)] px-[1vw] py-[.3vw] text-[clamp(9px,.85vw,12px)] font-semibold text-white">
              คริสตัลฐาน {crystalHp}/{crystalHpMax}
            </div>
          </div>

          {/* top-5 heroes — ช่องที่ยังไม่มีผู้เล่นจริง ไม่ render อะไรเลย (ไม่โชว์ sprite ผี) */}
          {FORMATION.map((f, i) => {
            const p = topFive[i];
            if (!p) return null;
            const d = roster.get(p.id);
            const name = d?.name ?? "…";
            const sprite = d?.sprite ?? FALLBACK_SPRITES[i];
            return (
              <div
                key={i}
                className={`absolute flex flex-col items-center ${heroAttackRank === i ? "animate-br-tv-lunge" : ""}`}
                style={{ left: `${f.left}%`, bottom: `${f.bottom}%`, width: `${f.w}%` }}
              >
                <div className="relative w-full" style={{ aspectRatio: 1 }}>
                  <Image src={sprite} alt="" fill sizes="12vw" className="object-contain drop-shadow-lg" />
                </div>
                <div
                  className={`mt-[2px] whitespace-nowrap rounded-md bg-[rgba(15,12,34,.72)] px-[6px] py-[1px] text-[clamp(8px,.75vw,10px)] ${
                    i === 0 ? "font-bold text-gold-hi" : "text-white"
                  }`}
                >
                  {i + 1}. {name}
                </div>
              </div>
            );
          })}

          {/* บอส — ขยับเข้าใกล้/ใหญ่ตาม crystal frac */}
          <div
            className="absolute flex flex-col items-center gap-[.5vw] transition-all duration-[1300ms] ease-out"
            style={{ right: `${bossRight}%`, bottom: `${bossBottom}%`, width: `${bossWidth}%` }}
          >
            <div className="whitespace-nowrap rounded-lg bg-[rgba(15,12,34,.72)] px-[1vw] py-[.3vw] text-[clamp(9px,.85vw,12px)] font-semibold text-white">
              บอส · {bossHp}/{bossHpMax}
            </div>
            <div
              className={`animate-br-tv-bob relative w-full transition-[filter] ${bossFlash ? "brightness-[1.8]" : ""}`}
              style={{ aspectRatio: BOSS_ASPECT }}
            >
              <Image
                src={BOSS_SRC}
                alt="บอส"
                fill
                sizes="40vw"
                className={`object-contain ${
                  weakPointLive
                    ? "drop-shadow-[0_0_1.6vw_#ffd166]"
                    : "drop-shadow-[0_1.4vw_1.4vw_rgba(0,0,0,.6)]"
                }`}
              />
            </div>
          </div>

          {/* damage floats */}
          {floats.map((fl) => (
            <span
              key={fl.key}
              className="animate-br-tv-float-up pointer-events-none absolute z-30 text-[clamp(14px,1.7vw,22px)] font-extrabold text-white [text-shadow:0_2px_0_#b33,0_0_10px_rgba(255,106,77,.8)]"
              style={{ left: `${fl.x}%`, top: `${fl.y}%` }}
            >
              {fl.text}
            </span>
          ))}
        </div>

        {/* ===== participation bar ===== */}
        <div className="absolute bottom-[4.5%] left-[4%] z-10 w-[92%]">
          <div className="mb-[.3vw] text-[clamp(8px,.72vw,10px)] text-white/65 [text-shadow:0_1px_3px_rgba(0,0,0,.8)]">
            ทั้งห้อง {participantCount} คน — ตอบถูกแล้วดวงจะสว่าง
          </div>
          <div className="flex flex-wrap gap-[.35vw]">
            {Array.from({ length: participantCount }).map((_, i) => (
              <span
                key={i}
                className={`h-[.8vw] min-h-[7px] w-[.8vw] min-w-[7px] rounded-full border border-white/35 transition-all duration-200 ${
                  litSet.has(i) ? "scale-[1.55] bg-[#52d9d4] shadow-[0_0_6px_#52d9d4]" : "bg-white/25"
                }`}
              />
            ))}
          </div>
        </div>

        {/* ===== ticker ===== */}
        <div className="absolute bottom-[.8%] left-[4%] z-20 flex w-[56%] flex-col-reverse gap-[.3vw]">
          {shownTicker.map((t) => (
            <div
              key={t.key}
              className={`overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-[rgba(10,8,26,.62)] px-[.9vw] py-[.35vw] text-[clamp(9px,.82vw,12px)] ${
                t.crit
                  ? "border-l-[3px] border-[#ff6a4d] font-bold text-[#ffcdbf]"
                  : "border-l-[3px] border-gold text-white"
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>

        {/* ===== meteor overlay ===== */}
        {meteorLive && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[rgba(10,8,26,.55)]">
            <div className="text-[clamp(16px,2.6vw,32px)] font-extrabold text-gold-hi drop-shadow-lg">☄️ ฝนดาวตก!</div>
            <div className="mt-[.6vw] text-[clamp(11px,1.2vw,15px)] text-white">
              รีบตอบที่มือถือ — คนแรกที่ตอบถูกได้โบนัส +15
            </div>
            <div className="mt-[.8vw] text-[clamp(24px,4vw,48px)] font-extrabold text-white">{meteorRemain}</div>
          </div>
        )}

        {/* ===== spotlight ผู้ชนะฝนดาวตก ===== */}
        {spotlight && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[rgba(10,8,26,.82)]">
            <div className="animate-br-tv-spotlight-pop text-[clamp(40px,7vw,90px)]">⭐</div>
            <div className="mt-[1vw] text-[clamp(16px,2.4vw,30px)] font-extrabold text-gold-hi drop-shadow-lg">
              {roster.get(spotlight.participantId)?.name ?? "ผู้เล่น"}
            </div>
            <div className="mt-[.4vw] text-[clamp(10px,1.05vw,14px)] text-white">
              คว้าโบนัสฝนดาวตกไปก่อน! +{spotlight.bonusDamage}
            </div>
          </div>
        )}

        {/* ===== end ===== */}
        {ended && (
          <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[rgba(10,8,26,.9)] text-center">
            <div
              className={`text-[clamp(32px,6vw,72px)] font-extrabold ${
                s.result === "win" ? "text-gold-hi" : "text-white"
              }`}
            >
              {s.result === "win" ? "ห้องชนะ! 🎉" : "บอสชนะรอบนี้ 💫"}
            </div>
            <div className="mt-3 text-[clamp(12px,1.4vw,18px)] text-white/75">
              {s.result === "win"
                ? "ทั้งห้องช่วยกันล้มบอสได้สำเร็จ"
                : "คริสตัลแตกแล้ว — รอบหน้าลองใหม่ ทุกคนทำได้ดีมาก"}
            </div>

            {s.result === "win" && rewards && rewards.length > 0 && (
              <div className="mt-[2vw] w-[min(560px,70%)]">
                <div className="mb-[.6vw] text-[clamp(11px,1.15vw,15px)] font-bold text-gold-hi">
                  🥚 ผู้ได้รับไข่รางวัล ({rewards[0].eggNameTh})
                </div>
                <ol className="flex flex-col gap-[.4vw]">
                  {rewards.map((r) => (
                    <li
                      key={r.participantId}
                      className="flex items-center justify-between rounded-md bg-white/10 px-[1.2vw] py-[.5vw] text-[clamp(10px,1.05vw,14px)] text-white"
                    >
                      <span>
                        {r.rank}. {roster.get(r.participantId)?.name ?? "ผู้เล่น"}
                      </span>
                      <span className="text-white/60">ดาเมจ {r.totalDamage}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
