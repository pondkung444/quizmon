"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { BOSSES, fitMove, moveHand, type CardId, type ChapterBattle, type TurnLog } from "@/lib/raid/cards/engine";
import type { CardBattleView } from "@/lib/raid/cards/server";
import { answerRaidCard, pickRaidMove, reloadRaidCardBattle } from "@/app/raid/card-actions";
import { useSfx } from "@/lib/audio/useSfx";
import { track } from "@/lib/analytics";
import { raidAnswerProps, raidMovePickProps } from "./events";
import EndPanel from "./EndPanel";
import ArenaStage from "./ArenaStage";
import MovePanel from "./MovePanel";
import AnswerSheet from "./AnswerSheet";
import ResultSheet from "./ResultSheet";
import styles from "./arena.module.css";

// Screen state comes from the server view, so closing the app at any point resumes the same screen.
// playToken is set only by a live answer: a reload shows final values and never replays the hit.
export default function RaidArena({ view }: { view: CardBattleView }) {
  const router = useRouter();
  const sfx = useSfx();
  const [current, setCurrent] = useState(view);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(-1);
  const [playToken, setPlayToken] = useState(0);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const lock = useRef(false);
  if (view.revision > current.revision) setCurrent(view);

  const battle = current.battle as ChapterBattle;

  async function guarded(task: () => Promise<void>, fallback: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await task(); }
    catch (e) { setError(e instanceof Error ? e.message : fallback); }
    finally { lock.current = false; setBusy(false); }
  }
  const pick = (card: CardId) => guarded(async () => {
    track("raid_move_pick", raidMovePickProps(battle, card, fitMove(battle)));
    setCurrent(await pickRaidMove(current.runId, current.revision, card));
  }, "ยังเตรียมโจทย์ไม่ได้");
  async function answer(index: number) {
    let ok = false;
    await guarded(async () => {
      const next = await answerRaidCard(current.runId, current.revision, index);
      setCurrent(next);
      ok = true;
      if (next.revision > current.revision) {
        setPlayToken(next.revision);
        sfx(next.feedback?.correct ? "answer_correct" : "answer_wrong");
        if (current.question) track("raid_answer", raidAnswerProps(battle, current.question.cardId, !!next.feedback?.correct));
      }
    }, "ยังตรวจคำตอบไม่ได้");
    return ok;
  }
  const reload = () => guarded(async () => {
    setCurrent(await reloadRaidCardBattle(current.runId));
    setPlayToken(0);
  }, "ยังโหลดไม่ได้");

  const feedback = !current.question && current.feedback && current.feedback.revision > dismissed ? current.feedback : null;
  const last = battle.log.at(-1) as TurnLog | undefined;
  const mode = current.question ? "question" : feedback ? "result" : "move";
  const withSheet = !ending && (mode !== "move" || !!battle.outcome);
  const accent = BOSSES[battle.bossId].accent;

  return <main
    className={`${styles.root} ${ending ? styles.endMode : ""} ${withSheet ? `${styles.withSheet} ${mode === "question" ? styles.qMode : styles.rMode}` : ""}`}
    data-boss={battle.bossId}
    style={{ "--boss": accent, "--fit-h": sheetHeight ? `${sheetHeight}px` : undefined } as CSSProperties}
  >
    <ArenaStage
      battle={battle} petName={current.petName} petImage={current.petImage}
      playToken={playToken} tight={withSheet && sheetHeight !== null && sheetHeight < 230}
      thin={withSheet && sheetHeight !== null && sheetHeight < 130}
      onHome={() => router.push("/pet")}
    />
    <div className={styles.panel}>
      {error && <div className={styles.error} role="alert">{error} <button type="button" onClick={reload} disabled={busy}>โหลดสถานะล่าสุด</button></div>}
      {ending
        ? <EndPanel runId={current.runId} battle={battle} petId={current.petId ?? null} petName={current.petName} chapterMode={current.chapterMode ?? null} />
        : current.question
        ? <AnswerSheet key={current.question.revision} question={current.question} busy={busy} onAnswer={answer} onFit={setSheetHeight} />
        : feedback && last
          ? <ResultSheet key={feedback.revision} feedback={feedback} log={last} battle={battle} petName={current.petName} petImage={current.petImage} busy={busy}
              onFit={setSheetHeight} onNext={() => { if (battle.outcome) setEnding(true); else { setDismissed(feedback.revision); setSheetHeight(null); } }} />
          : battle.outcome
            ? <div className={`${styles.sheet} ${styles.finishSheet}`}>
                <h3>เกือบแล้ว!</h3>
                <p>ไม่มีโจทย์ใหม่ให้ตอบแล้ว จบรอบรับอุปกรณ์กลับบ้านได้เลย</p>
                <button type="button" className={styles.cta} disabled={busy} onClick={() => setEnding(true)}>ดูผลการท้าทาย</button>
              </div>
            : <MovePanel key={current.revision} hand={moveHand(battle)} battle={battle} petName={current.petName} busy={busy} onPick={pick} />}
    </div>
  </main>;
}
