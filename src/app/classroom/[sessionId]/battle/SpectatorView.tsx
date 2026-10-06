"use client";

import { narrateRound, phaseHeadline } from "@/lib/teamBattle/central";
import { STUDENT_TEXT } from "@/lib/teamBattle/student";
import type { CentralBattleView } from "@/lib/teamBattle/types";
import styles from "./battle.module.css";

// ผู้ชม (ไม่มีแถวสมาชิก / ถูกตัดเป็นผู้ชม): ตัวเลขรวมเท่านั้น — HP สองทีม, ยกที่, ใครกำลังทำอะไร, ผลยกล่าสุด
// รับ CentralBattleView (ไม่มี user_id) เพื่อกันหลุดข้อมูลรายคน
export default function SpectatorView({ view }: { view: CentralBattleView }) {
  const b = view.battle;
  const last = view.last_round;
  const n = last ? narrateRound(last) : null;
  return (
    <section className={`space-y-3 ${styles.sentIn}`} data-testid="spectator-view">
      <div className="rounded-3xl border border-gold-dim bg-card p-5 text-center">
        <p className="text-lg font-bold text-gold-hi">{STUDENT_TEXT.spectator}</p>
        <p className="mt-2 text-sm text-text2">
          ยกที่ {b.current_round} · {phaseHeadline(b.attacker_team, b.phase)}
        </p>
        {b.phase === "answering" && (
          <p className="mt-1 text-sm text-text3">
            {STUDENT_TEXT.answeredCount(view.round.answered, view.round.defenders_total ?? 0)}
          </p>
        )}
      </div>
      {n && last && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold text-text">{n.headline}</p>
          <ul className="mt-1 space-y-0.5">
            {n.lines.map((l) => (
              <li key={l} className="text-sm text-text2">
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
