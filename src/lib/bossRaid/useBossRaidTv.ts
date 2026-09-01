"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// จอทีวี (Phase 1) — realtime hook แยกจาก useBossRaidLobby.ts เพราะจอทีวีต้อง subscribe เพิ่มอีก
// 2 ตาราง (boss_raid_answers ทำ ticker/damage-float/participation-dot, boss_raid_event_log ทำ
// banner event เริ่ม + spotlight ผู้ชนะฝนดาวตก) ที่จอ lobby/มือถือไม่ต้องใช้ — ทั้งสองตารางเพิ่งเปิด
// SELECT + realtime publication ให้เมื่อ 2026-09-01
// (20260901160000_boss_raid_phase_1_ui_realtime_read_access.sql, สโคป is_boss_raid_member(session_id)
// เดียวกับทุกตารางอื่นในระบบนี้ — ไม่มีการเปิดกว้างกว่านั้น)
//
// convention เดียวกับ useBossRaidLobby.ts (§12 Connection Resilience):
//   - 1 channel ต่อ session, filter ทุก subscribe ด้วย session_id (ไม่ subscribe ทั้งตารางเปล่าๆ)
//   - resync state หลัก (session/top5/count/names) เต็มทุกครั้งที่ (re)subscribe สำเร็จ
//   - ticker/combo/spotlight/damage-float เป็น ephemeral UI state ล้วนๆ — ไม่ replay ของเก่าตอน reconnect
//
// hook นี้เป็นเจ้าของ transient animation state ทั้งหมด (heroAttackRank/bossFlash/floats/litDots/
// spotlight/comboBump) เพราะ setState จาก realtime callback อนุญาต แต่ setState จาก useEffect body
// ใน component โดน eslint react-hooks/set-state-in-effect บล็อก — component เลยเหลือแค่ render อย่างเดียว
//
// ชื่อผู้เล่น: schema ไม่มี boss/pet species field (survey — start_boss_raid_game ไม่เคยเซ็ต boss identity)
// TV ใช้ asset บอสตัวเดียวคงที่ + sprite Qmon generic ต่อ "ช่องอันดับ" (ไม่ผูกสายพันธุ์คนจริง — เหมือน
// mockup v9 หมุน petKeys ตาม slot) ชื่อ/ดาเมจ top-5 จาก get_boss_raid_participant_names() เท่านั้นที่
// เป็น per-player จริง

export type TvActiveEvent =
  | null
  | { type: "weak_point"; expires_at: string }
  | {
      type: "meteor";
      question_id: number;
      question_text: string;
      choices: string[];
      expires_at: string;
      winner_participant_id: string | null;
    };

export type TvSession = {
  id: string;
  status: "lobby" | "in_progress" | "ended";
  join_code: string;
  config: { chapter_ids?: number[]; difficulty?: string; timer_seconds?: number };
  boss_hp: number | null;
  boss_hp_max: number | null;
  crystal_hp: number | null;
  crystal_hp_max: number | null;
  current_tier: "light" | "medium" | "heavy" | null;
  wrong_count_total: number | null;
  active_event: TvActiveEvent;
  result: "win" | "lose" | null;
};

export type TvRankedParticipant = { id: string; total_damage: number; joined_at: string };

export type TvTickerEvent = { key: string; text: string; crit: boolean };

export type TvFloat = { key: number; text: string; x: number; y: number };

export type TvSpotlight = { participantId: string; bonusDamage: number };

type State = {
  session: TvSession | null;
  topFive: TvRankedParticipant[];
  participantCount: number;
  names: Map<string, string>;
  ticker: TvTickerEvent[];
  combo: number;
  comboBump: number;
  heroAttackRank: number | null;
  bossFlash: boolean;
  floats: TvFloat[];
  litDots: number[];
  spotlight: TvSpotlight | null;
  connected: boolean;
};

const TICKER_MAX = 6;
// bonus_damage ของฝนดาวตกเป็นค่าคงที่ (c_bonus_damage ใน submit_boss_raid_event_answer) — ไม่ broadcast
// ผ่าน realtime (อยู่ใน return value ของ RPC ที่เห็นแค่คนตอบเอง) TV เดาจากค่าคงที่นี้ตรงๆ
// ถ้าค่าคงที่ฝั่ง DB เปลี่ยนในอนาคต ต้องแก้ตรงนี้คู่กัน
const METEOR_BONUS_DAMAGE = 15;

export function useBossRaidTv(
  sessionId: string,
  initial: {
    session: TvSession | null;
    topFive: TvRankedParticipant[];
    participantCount: number;
    names: Record<string, string>;
  }
): State {
  const [session, setSession] = useState<TvSession | null>(initial.session);
  const [topFive, setTopFive] = useState<TvRankedParticipant[]>(initial.topFive);
  const [participantCount, setParticipantCount] = useState(initial.participantCount);
  const [names, setNames] = useState<Map<string, string>>(
    () => new Map(Object.entries(initial.names))
  );
  const [ticker, setTicker] = useState<TvTickerEvent[]>([]);
  const [combo, setCombo] = useState(0);
  const [comboBump, setComboBump] = useState(0);
  const [heroAttackRank, setHeroAttackRank] = useState<number | null>(null);
  const [bossFlash, setBossFlash] = useState(false);
  const [floats, setFloats] = useState<TvFloat[]>([]);
  const [litDots, setLitDots] = useState<number[]>([]);
  const [spotlight, setSpotlight] = useState<TvSpotlight | null>(null);
  const [connected, setConnected] = useState(false);

  // refs = ค่า state ล่าสุดสำหรับอ่านใน realtime callback (sync ผ่าน effect — ห้ามเขียน ref ตอน render)
  const namesRef = useRef(names);
  const sessionRef = useRef(session);
  const topFiveRef = useRef(topFive);
  const participantCountRef = useRef(participantCount);
  const prevActiveEventRef = useRef<TvActiveEvent>(initial.session?.active_event ?? null);

  useEffect(() => {
    namesRef.current = names;
    sessionRef.current = session;
    topFiveRef.current = topFive;
    participantCountRef.current = participantCount;
  }, [names, session, topFive, participantCount]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    // setTimeout ที่ auto-clear ตัวเองออกจาก set + ถูกเก็บกวาดตอน unmount
    function later(fn: () => void, ms: number) {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!cancelled) fn();
      }, ms);
      timers.add(id);
    }

    function pushTicker(text: string, crit: boolean, key?: string) {
      setTicker((prev) =>
        [...prev, { key: key ?? `evt-${Date.now()}-${Math.random()}`, text, crit }].slice(-TICKER_MAX)
      );
    }

    async function refetchRoster() {
      const [{ data: ranked }, { count }, { data: nameRows }] = await Promise.all([
        supabase
          .from("boss_raid_participants")
          .select("id, total_damage, joined_at")
          .eq("session_id", sessionId)
          // total_damage desc = อันดับหลัก, joined_at asc = tie-break คงที่ (เข้าก่อนอยู่หน้ากว่าเมื่อดาเมจเท่ากัน
          // เช่นตอนเริ่มเกมทุกคน total_damage=0 พร้อมกัน) กัน "อันดับสลับไปมา" ทุกครั้งที่ refetch
          .order("total_damage", { ascending: false })
          .order("joined_at", { ascending: true })
          .limit(5),
        supabase
          .from("boss_raid_participants")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId),
        supabase.rpc("get_boss_raid_participant_names", { p_session_id: sessionId }),
      ]);
      if (cancelled) return;
      setTopFive((ranked as TvRankedParticipant[] | null) ?? []);
      setParticipantCount(count ?? 0);
      if (nameRows) {
        setNames(
          new Map(
            (nameRows as { participant_id: string; display_name: string }[]).map((r) => [
              r.participant_id,
              r.display_name,
            ])
          )
        );
      }
    }

    async function refetchSession() {
      const { data } = await supabase
        .from("boss_raid_sessions")
        .select(
          "id, status, join_code, config, boss_hp, boss_hp_max, crystal_hp, crystal_hp_max, current_tier, wrong_count_total, active_event, result"
        )
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      const row = (data as TvSession | null) ?? null;
      prevActiveEventRef.current = row?.active_event ?? null;
      setSession(row);
    }

    const channel = supabase
      .channel(`boss-raid-tv:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "boss_raid_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          if (cancelled) return;
          const merged = { ...(sessionRef.current ?? initial.session), ...payload.new } as TvSession;
          const prevEvent = prevActiveEventRef.current;
          const nextEvent = merged.active_event;

          if (
            nextEvent &&
            (!prevEvent || prevEvent.type !== nextEvent.type || prevEvent.expires_at !== nextEvent.expires_at)
          ) {
            pushTicker(
              nextEvent.type === "weak_point" ? "✦ จุดอ่อนเผย! ดาเมจทั้งห้อง ×2" : "☄️ ฝนดาวตก! รีบตอบที่มือถือ",
              false
            );
          }

          if (
            nextEvent?.type === "meteor" &&
            nextEvent.winner_participant_id &&
            !(prevEvent?.type === "meteor" && prevEvent.winner_participant_id)
          ) {
            const winnerId = nextEvent.winner_participant_id;
            setSpotlight({ participantId: winnerId, bonusDamage: METEOR_BONUS_DAMAGE });
            later(() => setSpotlight(null), 2600);
            const name = namesRef.current.get(winnerId) ?? "ผู้เล่น";
            pushTicker(`⭐ ${name} คว้าโบนัสฝนดาวตกไปก่อน! +${METEOR_BONUS_DAMAGE}`, true);
          }

          prevActiveEventRef.current = nextEvent;
          setSession(merged);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boss_raid_participants", filter: `session_id=eq.${sessionId}` },
        () => {
          if (!cancelled) void refetchRoster();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "boss_raid_answers", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as {
            id: string;
            participant_id: string;
            is_correct: boolean;
            is_crit: boolean | null;
            damage_dealt: number | null;
          };
          if (!row.is_correct) {
            // ตอบผิด: รีเซ็ตคอมโบเงียบๆ — ไม่ขึ้น ticker ต่อคน (กันการชี้ตัวว่าใครตอบผิดต่อหน้าห้อง)
            setCombo(0);
            return;
          }
          setCombo((c) => c + 1);
          setComboBump((b) => b + 1);

          const dmg = row.damage_dealt ?? 0;
          const crit = !!row.is_crit;
          const name = namesRef.current.get(row.participant_id) ?? "ผู้เล่น";
          pushTicker(crit ? `🔥 ${name} CRITICAL! -${dmg}` : `⚔️ ${name} โจมตี -${dmg}`, crit, row.id);

          // บอสวาบ
          setBossFlash(true);
          later(() => setBossFlash(false), 160);

          // hero lunge เฉพาะถ้าผู้โจมตีอยู่ใน top-5 จริง (คนนอก top-5 ขึ้นแค่ ticker ไม่มี sprite ให้ขยับ)
          const rank = topFiveRef.current.findIndex((p) => p.id === row.participant_id);
          if (rank >= 0) {
            setHeroAttackRank(rank);
            later(() => setHeroAttackRank((r) => (r === rank ? null : r)), 550);
          }

          // damage float ใกล้บอสฝั่งขวา
          const fkey = Date.now() + Math.random();
          setFloats((prev) => [
            ...prev,
            { key: fkey, text: (crit ? "CRIT -" : "-") + dmg, x: 62 + Math.random() * 14, y: 30 + Math.random() * 10 },
          ]);
          later(() => setFloats((prev) => prev.filter((f) => f.key !== fkey)), 900);

          // participation dot วาบ — จุดสุ่ม (ไม่ผูกตัวตน ตาม "ไม่มีชื่อ" ของ participation bar) แต่ trigger จาก
          // การตอบถูกจริงเท่านั้น ไม่ใช่สุ่มเองแบบ mockup
          const n = participantCountRef.current;
          if (n > 0) {
            const dot = Math.floor(Math.random() * n);
            setLitDots((prev) => (prev.includes(dot) ? prev : [...prev, dot]));
            later(() => setLitDots((prev) => prev.filter((d) => d !== dot)), 900);
          }
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (ok) {
          // §12.4 — resync state หลักทุกครั้งที่ (re)subscribe สำเร็จ กัน event ตกหล่นช่วงหลุดต่อ
          void refetchSession();
          void refetchRoster();
        }
      });

    return () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return {
    session,
    topFive,
    participantCount,
    names,
    ticker,
    combo,
    comboBump,
    heroAttackRank,
    bossFlash,
    floats,
    litDots,
    spotlight,
    connected,
  };
}
