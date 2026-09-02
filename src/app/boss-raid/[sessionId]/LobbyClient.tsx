"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  useBossRaidLobby,
  type LobbyParticipant,
  type LobbySession,
} from "@/lib/bossRaid/useBossRaidLobby";
import Image from "next/image";
import {
  updateBossRaidConfig,
  startBossRaidGame,
  getBossRaidRewards,
  type BossRaidConfig,
  type BossRaidRewardRow,
} from "../actions";
import { getPetImagePath } from "@/lib/petImage";
import JoinQr from "./JoinQr";
import BossRaidGame from "./BossRaidGame";

type ChapterRow = {
  id: number;
  grade_band: string;
  grade_level: string | null;
  subject_label: string;
  chapter: string;
};

type RewardEggRow = { id: string; name_th: string; tier: string };

const DIFFICULTIES: Array<BossRaidConfig["difficulty"]> = ["easy", "medium", "hard"];
const DIFF_TH: Record<string, string> = { easy: "ง่าย", medium: "กลาง", hard: "ยาก" };
const STATUS_TH: Record<string, string> = {
  lobby: "รอเริ่ม",
  in_progress: "กำลังเล่น",
  ended: "จบแล้ว",
};
const TIER_TH: Record<string, string> = { light: "เบา", medium: "กลาง", heavy: "แรง" };

export default function LobbyClient({
  sessionId,
  userId,
  isTeacher,
  initialSession,
  initialParticipants,
}: {
  sessionId: string;
  userId: string;
  isTeacher: boolean;
  initialSession: LobbySession;
  initialParticipants: LobbyParticipant[];
}) {
  const { session, participants, connected } = useBossRaidLobby(sessionId, {
    session: initialSession,
    participants: initialParticipants,
  });

  const s = session ?? initialSession;
  const myParticipant = participants.find((p) => p.user_id === userId) ?? null;
  const joinPath = `/boss-raid/join?code=${s.join_code}`;
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin
  );
  const [copied, setCopied] = useState(false);

  const joinUrl = origin ? `${origin}${joinPath}` : "";

  function copyLink() {
    if (!joinUrl) return;
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text2">รหัสห้อง</p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em] text-gold-hi">{s.join_code}</p>
        </div>
        <div className="text-right">
          <span className="rounded-full border border-gold-dim bg-card px-3 py-1 text-sm text-gold-hi">
            {STATUS_TH[s.status]}
          </span>
          <p className="mt-1 text-xs text-text3">
            {connected ? "🟢 เชื่อมต่อสด" : "⚪ กำลังเชื่อมต่อ…"}
          </p>
        </div>
      </div>

      {s.status === "lobby" && (
        <section className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-gold-dim bg-card p-5 sm:flex-row sm:items-center">
          <JoinQr url={joinUrl} size={168} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-sm font-bold text-gold-hi">ให้นักเรียนสแกน QR เพื่อเข้าห้อง</p>
            <p className="mt-1 text-xs text-text3">หรือเปิดลิงก์ / กรอกรหัส {s.join_code} ที่หน้าเข้าห้อง</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-track px-3 py-2 text-xs text-text2">
              <Link href={joinPath} className="min-w-0 break-all underline hover:text-gold-hi">
                {joinPath}
              </Link>
              <button
                type="button"
                onClick={copyLink}
                disabled={!joinUrl}
                className="ml-auto shrink-0 rounded border border-gold-dim bg-card px-2 py-1 font-medium text-gold-hi disabled:opacity-50"
              >
                {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
              </button>
            </div>
          </div>
        </section>
      )}

      {isTeacher && s.status === "lobby" && <ConfigPanel sessionId={sessionId} config={s.config} />}

      {isTeacher && s.status === "lobby" && (
        <StartGameButton
          sessionId={sessionId}
          noPlayers={participants.length === 0}
          noChapters={(s.config.chapter_ids?.length ?? 0) === 0}
        />
      )}

      {s.status !== "lobby" && (s.boss_hp_max != null || s.crystal_hp_max != null) && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gold-dim bg-card p-3 text-center">
              <p className="text-xs text-text3">บอส HP</p>
              <p className="text-2xl font-bold text-red">
                {s.boss_hp} / {s.boss_hp_max}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-track">
                <div
                  className="h-full bg-red transition-all"
                  style={{
                    width: `${
                      s.boss_hp_max ? Math.max(0, ((s.boss_hp ?? 0) / s.boss_hp_max) * 100) : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-gold-dim bg-card p-3 text-center">
              <p className="text-xs text-text3">
                คริสตัล HP · บอสระดับ{TIER_TH[s.current_tier ?? "light"] ?? "เบา"}
              </p>
              <p className="text-2xl font-bold text-indigo-hi">
                {s.crystal_hp} / {s.crystal_hp_max}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-track">
                <div
                  className="h-full bg-indigo-hi transition-all"
                  style={{
                    width: `${
                      s.crystal_hp_max
                        ? Math.max(0, ((s.crystal_hp ?? 0) / s.crystal_hp_max) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </section>
          <p className="mt-2 text-center text-xs text-text3">
            ตอบผิดรวมทั้งห้อง {s.wrong_count_total ?? 0}
          </p>
        </>
      )}

      {s.status === "ended" && (
        <EndScreen
          sessionId={sessionId}
          result={s.result ?? null}
          myParticipantId={myParticipant?.id ?? null}
        />
      )}

      {s.status === "in_progress" && myParticipant && (
        <BossRaidGame
          participantId={myParticipant.id}
          currentQuestionId={myParticipant.current_question_id ?? null}
          bossHp={s.boss_hp}
          bossHpMax={s.boss_hp_max}
          crystalHp={s.crystal_hp}
          crystalHpMax={s.crystal_hp_max}
          currentTier={s.current_tier}
        />
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-gold-hi">
          ผู้เล่นในห้อง <span className="text-text3">({participants.length})</span>
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {participants.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-border bg-card px-3 py-2 text-center text-sm"
            >
              <span className="block truncate font-mono text-xs text-text3">
                {p.user_id.slice(0, 8)}
              </span>
              <span className="text-text2">
                รวมสเตตัส {Object.values(p.stat_snapshot ?? {}).reduce((a, b) => a + (b || 0), 0)}
              </span>
            </li>
          ))}
          {participants.length === 0 && (
            <li className="col-span-full rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-text3">
              รอผู้เล่นเข้าห้อง…
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

function EndScreen({
  sessionId,
  result,
  myParticipantId,
}: {
  sessionId: string;
  result: "win" | "lose" | null;
  myParticipantId: string | null;
}) {
  const [rewards, setRewards] = useState<BossRaidRewardRow[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (result !== "win" || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    async function load(attempt: number) {
      try {
        const rows = await getBossRaidRewards(sessionId);
        if (cancelled) return;
        // distribution อยู่ transaction เดียวกับ win-transition แล้ว แต่กันเหนียว: ถ้ายังว่าง retry 1 ครั้ง
        if (rows.length === 0 && attempt === 0) {
          setTimeout(() => void load(1), 1200);
          return;
        }
        setRewards(rows);
      } catch (e) {
        console.error("getBossRaidRewards failed:", e);
        if (!cancelled) setRewards([]);
      }
    }
    void load(0);
    return () => {
      cancelled = true;
    };
  }, [sessionId, result]);

  const myReward =
    myParticipantId != null ? rewards?.find((r) => r.participantId === myParticipantId) ?? null : null;

  return (
    <section className="mt-6 rounded-2xl border border-gold-dim bg-card p-8 text-center">
      <p className={`text-4xl font-bold ${result === "win" ? "text-gold-hi" : "text-red"}`}>
        {result === "win" ? "ห้องชนะ! 🎉" : "บอสชนะ 💀"}
      </p>

      {result === "win" && rewards != null && (
        <div className="mt-5">
          {myParticipantId != null ? (
            myReward ? (
              <div className="flex flex-col items-center gap-2">
                <Image
                  src={getPetImagePath(myReward.spritePrefix, 1, null, null)}
                  alt={myReward.eggNameTh}
                  width={120}
                  height={120}
                  className="animate-evolve-pop"
                />
                <p className="text-lg font-bold text-gold-hi">
                  🥚 คุณได้รับ {myReward.eggNameTh}!
                </p>
                <p className="text-xs text-text3">อันดับ #{myReward.rank} · ดาเมจ {myReward.totalDamage}</p>
              </div>
            ) : (
              <p className="text-sm text-text3">
                {rewards.length > 0
                  ? "รอบนี้ยังไม่ได้ไข่ — ตอบให้ไวขึ้นรอบหน้านะ"
                  : "รอบนี้ไม่มีรางวัลไข่"}
              </p>
            )
          ) : rewards.length > 0 ? (
            <div className="mx-auto max-w-xs text-left">
              <p className="mb-2 text-center text-sm font-semibold text-text2">
                ผู้ได้รับไข่รางวัล
              </p>
              <ul className="space-y-1 text-sm text-text">
                {rewards.map((r) => (
                  <li key={r.participantId} className="flex justify-between gap-2">
                    <span>
                      #{r.rank} · {r.eggNameTh}
                    </span>
                    <span className="text-text3">ดาเมจ {r.totalDamage}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-text3">รอบนี้ไม่มีรางวัลไข่</p>
          )}
        </div>
      )}
    </section>
  );
}

function StartGameButton({
  sessionId,
  noPlayers,
  noChapters,
}: {
  sessionId: string;
  noPlayers: boolean;
  noChapters: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blockedReason = noChapters
    ? "เลือกบทเรียนแล้วกดบันทึกการตั้งค่าก่อนเริ่มเกม"
    : noPlayers
      ? "รอผู้เล่นเข้าห้องอย่างน้อย 1 คน"
      : null;

  function go() {
    start(async () => {
      setError(null);
      try {
        await startBossRaidGame(sessionId);
        // ไม่ต้อง setState — realtime UPDATE ของ session จะ push status/HP มาเอง
      } catch (e) {
        setError(e instanceof Error ? e.message : "เริ่มเกมไม่สำเร็จ");
      }
    });
  }

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={go}
        disabled={pending || blockedReason !== null}
        className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {pending ? "กำลังเริ่ม…" : "เริ่มเกม"}
      </button>
      {blockedReason && (
        <p className="mt-2 text-center text-xs text-text3">{blockedReason}</p>
      )}
      {error && <p className="mt-2 text-center text-sm text-red">{error}</p>}
    </section>
  );
}

function ConfigPanel({
  sessionId,
  config,
}: {
  sessionId: string;
  config: LobbySession["config"];
}) {
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chapterIds, setChapterIds] = useState<number[]>(config.chapter_ids ?? []);
  const [difficulty, setDifficulty] = useState<BossRaidConfig["difficulty"]>(
    (config.difficulty as BossRaidConfig["difficulty"]) ?? "medium"
  );
  const [timer, setTimer] = useState<number>(config.timer_seconds ?? 30);
  const [rewardEggs, setRewardEggs] = useState<RewardEggRow[]>([]);
  const [rewardEggTypeId, setRewardEggTypeId] = useState<string | null>(
    config.reward_egg_type_id ?? null
  );
  const [rewardTopN, setRewardTopN] = useState<number>(config.reward_top_n ?? 5);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("curriculum_chapters")
      .select("id, grade_band, grade_level, subject_label, chapter")
      .order("grade_order", { ascending: true })
      .order("chapter_order", { ascending: true })
      .then(({ data }) => setChapters((data ?? []) as ChapterRow[]));
  }, []);

  // ชนิดไข่รางวัลที่เลือกได้ — dynamic: tier common/rare/epic ที่ยัง obtainable (legendary กรองด้วย tier)
  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("egg_types")
      .select("id, name_th, tier")
      .in("tier", ["common", "rare", "epic"])
      .eq("is_obtainable", true)
      .order("tier", { ascending: true })
      .order("id", { ascending: true })
      .then(({ data }) => setRewardEggs((data ?? []) as RewardEggRow[]));
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, ChapterRow[]>();
    for (const c of chapters) {
      const key = `${c.grade_level ?? c.grade_band} · ${c.subject_label}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(c);
    }
    return [...m.entries()];
  }, [chapters]);

  function save() {
    start(async () => {
      setError(null);
      setSaved(false);
      try {
        await updateBossRaidConfig(sessionId, {
          chapter_ids: chapterIds,
          difficulty,
          timer_seconds: timer,
          reward_egg_type_id: rewardEggTypeId,
          reward_top_n: rewardEggTypeId ? rewardTopN : null,
        });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="text-lg font-bold text-gold-hi">ตั้งค่าห้อง</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-text2">ความยาก:</span>
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDifficulty(d)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              difficulty === d
                ? "border-gold bg-amber text-track"
                : "border-border bg-track text-text2"
            }`}
          >
            {DIFF_TH[d]}
          </button>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-text2">
        เวลาต่อข้อ (วินาที):
        <input
          type="number"
          min={5}
          max={180}
          value={timer}
          onChange={(e) => setTimer(Number(e.target.value))}
          className="w-20 rounded border border-border bg-track px-2 py-1 text-text"
        />
      </label>

      <div className="mt-3">
        <p className="text-sm text-text2">บทเรียน ({chapterIds.length} บท)</p>
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-track p-2">
          {grouped.map(([group, rows]) => (
            <div key={group} className="mb-2">
              <p className="text-xs font-semibold text-text3">{group}</p>
              {rows.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={chapterIds.includes(c.id)}
                    onChange={(e) =>
                      setChapterIds((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                      )
                    }
                  />
                  {c.chapter}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-sm font-semibold text-text2">รางวัลเมื่อชนะบอส</p>
        <p className="mt-0.5 text-xs text-text3">
          แจกไข่ให้ผู้เล่นที่ทำดาเมจสูงสุดตามอันดับ — เฉพาะตอนห้องชนะ (แพ้ไม่ได้อะไร)
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={rewardEggTypeId ?? ""}
            onChange={(e) => setRewardEggTypeId(e.target.value || null)}
            className="rounded border border-border bg-track px-2 py-1 text-sm text-text"
          >
            <option value="">ไม่แจกรางวัล</option>
            {rewardEggs.map((egg) => (
              <option key={egg.id} value={egg.id}>
                {egg.name_th} ({egg.tier})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-text2">
            จำนวนคนที่ได้:
            <input
              type="number"
              min={1}
              max={50}
              value={rewardTopN}
              disabled={!rewardEggTypeId}
              onChange={(e) => setRewardTopN(Number(e.target.value))}
              className="w-20 rounded border border-border bg-track px-2 py-1 text-text disabled:opacity-50"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-gold-hi">
          {rewardEggTypeId
            ? `จะแจก "${
                rewardEggs.find((e) => e.id === rewardEggTypeId)?.name_th ?? rewardEggTypeId
              }" ให้ผู้เล่น ${Math.min(50, Math.max(1, Math.round(rewardTopN || 1)))} อันดับแรกเมื่อชนะบอส`
            : "ไม่แจกรางวัลรอบนี้"}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg border border-gold-dim bg-track px-4 py-2 text-sm font-bold text-gold-hi transition active:scale-95 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </button>
        {saved && <span className="text-sm text-gold-hi">บันทึกแล้ว</span>}
        {error && <span className="text-sm text-red">{error}</span>}
      </div>
    </section>
  );
}
