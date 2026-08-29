"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  useBossRaidLobby,
  type LobbyParticipant,
  type LobbySession,
} from "@/lib/bossRaid/useBossRaidLobby";
import { updateBossRaidConfig, type BossRaidConfig } from "../actions";

type ChapterRow = {
  id: number;
  grade_band: string;
  grade_level: string | null;
  subject_label: string;
  chapter: string;
};

const DIFFICULTIES: Array<BossRaidConfig["difficulty"]> = ["easy", "medium", "hard"];
const DIFF_TH: Record<string, string> = { easy: "ง่าย", medium: "กลาง", hard: "ยาก" };
const STATUS_TH: Record<string, string> = {
  lobby: "รอเริ่ม",
  in_progress: "กำลังเล่น",
  ended: "จบแล้ว",
};

export default function LobbyClient({
  sessionId,
  isTeacher,
  initialSession,
  initialParticipants,
}: {
  sessionId: string;
  isTeacher: boolean;
  initialSession: LobbySession;
  initialParticipants: LobbyParticipant[];
}) {
  const { session, participants, connected } = useBossRaidLobby(sessionId, {
    session: initialSession,
    participants: initialParticipants,
  });

  const s = session ?? initialSession;
  const joinPath = `/boss-raid/join?code=${s.join_code}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    void navigator.clipboard
      .writeText(`${window.location.origin}${joinPath}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-black/50">รหัสห้อง</p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em]">{s.join_code}</p>
        </div>
        <div className="text-right">
          <span className="rounded-full bg-black/5 px-3 py-1 text-sm">{STATUS_TH[s.status]}</span>
          <p className="mt-1 text-xs text-black/40">
            {connected ? "🟢 เชื่อมต่อสด" : "⚪ กำลังเชื่อมต่อ…"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-xs text-black/60">
        <Link href={joinPath} className="break-all underline">
          {joinPath}
        </Link>
        <button
          type="button"
          onClick={copyLink}
          className="ml-auto shrink-0 rounded bg-black px-2 py-1 text-white"
        >
          {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
        </button>
      </div>

      {isTeacher && <ConfigPanel sessionId={sessionId} config={s.config} />}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          ผู้เล่นในห้อง <span className="text-black/40">({participants.length})</span>
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {participants.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-black/10 px-3 py-2 text-center text-sm"
            >
              <span className="block truncate font-mono text-xs text-black/50">
                {p.user_id.slice(0, 8)}
              </span>
              <span className="text-black/70">
                รวมสเตตัส {Object.values(p.stat_snapshot ?? {}).reduce((a, b) => a + (b || 0), 0)}
              </span>
            </li>
          ))}
          {participants.length === 0 && (
            <li className="col-span-full rounded-lg border border-dashed border-black/15 px-3 py-6 text-center text-sm text-black/40">
              รอผู้เล่นเข้าห้อง…
            </li>
          )}
        </ul>
      </section>
    </main>
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
        });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-black/10 p-4">
      <h2 className="text-lg font-semibold">ตั้งค่าห้อง</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-black/60">ความยาก:</span>
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDifficulty(d)}
            className={`rounded-full px-3 py-1 text-sm ${
              difficulty === d ? "bg-black text-white" : "bg-black/5"
            }`}
          >
            {DIFF_TH[d]}
          </button>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-black/60">
        เวลาต่อข้อ (วินาที):
        <input
          type="number"
          min={5}
          max={180}
          value={timer}
          onChange={(e) => setTimer(Number(e.target.value))}
          className="w-20 rounded border border-black/15 px-2 py-1"
        />
      </label>

      <div className="mt-3">
        <p className="text-sm text-black/60">บทเรียน ({chapterIds.length} บท)</p>
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-black/10 p-2">
          {grouped.map(([group, rows]) => (
            <div key={group} className="mb-2">
              <p className="text-xs font-semibold text-black/40">{group}</p>
              {rows.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
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

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </button>
        {saved && <span className="text-sm text-green-600">บันทึกแล้ว</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
