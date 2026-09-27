"use client";
import { useEffect, useState } from "react";
import {
  BOSSES,
  createChapterBattle,
  resolveTurn,
  type Battle,
  type BossId,
  type ChapterOffer,
  type CardId,
} from "@/lib/raid/cards/engine";
import type {
  RaidCardQuestion,
  RaidCardFeedback,
} from "@/lib/raid/cards/server";
import { createLearningFeedback } from "@/lib/learningFeedback";
import CardBattleArena from "./CardBattleArena";

const KEY = "quizmon-raid-chapters-preview-v4";
const PROFILES = {
  starter: { hp: 40, atk: 40, def: 40, spd: 40, foc: 40 },
  attack: { hp: 65, atk: 95, def: 55, spd: 75, foc: 70 },
  defense: { hp: 90, atk: 65, def: 95, spd: 55, foc: 70 },
  trained: { hp: 85, atk: 90, def: 85, spd: 90, foc: 80 },
};
type Profile = keyof typeof PROFILES;
type Preview = {
  battle: Battle;
  profile: Profile;
  question: RaidCardQuestion | null;
  feedback: RaidCardFeedback | null;
  answerKey: number | null;
};
function initial(
  boss: BossId = "ridge_mist",
  profile: Profile = "attack",
): Preview {
  return {
    battle: createChapterBattle(boss, PROFILES[profile], () => 0.3),
    profile,
    question: null,
    feedback: null,
    answerKey: null,
  };
}
const titles = [
  "การคูณ",
  "พื้นที่สี่เหลี่ยม",
  "สมการเชิงเส้น",
  "ความน่าจะเป็น",
];
function offers(b: Battle): ChapterOffer[] {
  const context: CardId =
    b.intent === "brace"
      ? "pierce"
      : b.intent === "charge" || b.intent === "thunder"
        ? "interrupt"
        : "counter";
  const skills: CardId[] = [
    "strike",
    "mend",
    context,
    b.turn < { ridge_mist: 5, ridge_gale: 6, ridge_storm: 8 }[b.bossId]
      ? "focus"
      : context === "counter"
        ? "pierce"
        : "counter",
  ];
  return skills.map((cardId, i) => ({
    id: `preview-${b.turn}-${i}`,
    chapter: titles[(i + b.turn) % 4],
    subject: "math",
    difficulty: 1,
    cardId,
  }));
}
export default function RaidCardPreview() {
  const [view, setView] = useState<Preview>(() => initial());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "null");
        if (saved?.battle?.version === 4 && saved.profile in PROFILES)
          setView(saved);
      } catch {}
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function save(next: Preview) {
    setView(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }
  const b = view.battle;
  function select(id: string) {
    if (view.question || b.outcome) return;
    const offer = offers(b).find((c) => c.id === id);
    if (!offer) return;
    const n = b.turn + 3;
    let text = "",
      answer = 0,
      imageUrl: string | null = null;
    if (offer.chapter === titles[0]) {
      text = `มีของ ${n} กล่อง กล่องละ 3 ชิ้น มีของทั้งหมดกี่ชิ้น?`;
      answer = n * 3;
    } else if (offer.chapter === titles[1]) {
      text = `สี่เหลี่ยมผืนผ้ากว้าง 3 เซนติเมตร ยาว ${n} เซนติเมตร มีพื้นที่กี่ตารางเซนติเมตร?`;
      answer = n * 3;
      imageUrl =
        "data:image/svg+xml," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="150"><rect x="40" y="35" width="230" height="80" fill="#d5edff" stroke="#234"/><text x="135" y="25">${n} cm</text><text x="5" y="80">3 cm</text></svg>`,
        );
    } else if (offer.chapter === titles[2]) {
      text = `ถ้า x + 3 = ${n + 3} แล้ว x มีค่าเท่าใด?`;
      answer = n;
    } else {
      text = `ในกล่องมีลูกบอล ${n} ลูก ทุกลูกเป็นสีแดง โอกาสหยิบได้ลูกบอลสีแดงคิดเป็นกี่เปอร์เซ็นต์?`;
      answer = 100;
    }
    const answerKey = b.turn % 4;
    const choices = [answer + 1, answer + 2, answer - 1, answer + 3].map(
      String,
    );
    choices[answerKey] = String(answer);
    const question: RaidCardQuestion = {
      revision: b.log.length + 1,
      cardId: offer.cardId,
      text,
      choices,
      imageUrl,
      subject: "math",
      category: offer.chapter,
    };
    save({ ...view, question, answerKey, feedback: null });
  }
  function answer(index: number) {
    if (!view.question || view.answerKey === null) return;
    const next = resolveTurn(
      b,
      view.question.cardId,
      Math.random,
      index === view.answerKey,
    );
    const feedback: RaidCardFeedback = {
      revision: view.question.revision,
      question: view.question,
      ...createLearningFeedback(
        index,
        view.answerKey,
        view.question.category === titles[3]
          ? "ทุกลูกเป็นสีแดง จึงมีโอกาส 100%"
          : view.question.category === titles[2]
            ? "ลบ 3 ทั้งสองข้างของสมการ"
            : `คูณ ${b.turn + 3} ด้วย 3 ได้ ${(b.turn + 3) * 3}`,
      ),
    };
    save({ ...view, battle: next, question: null, answerKey: null, feedback });
  }
  return (
    <>
      <CardBattleArena
        battle={b}
        petName="เจ้าสายหมอก"
        petImage="/pets/egg2_stage4_math_A.png"
        bestProgress={0}
        offers={offers(b)}
        onSelectOffer={select}
        question={view.question}
        feedback={view.feedback}
        onAnswer={answer}
        onContinue={() => save({ ...view, feedback: null })}
        busy={!ready}
        error={null}
        animateTurn={b.log.length}
        onPlay={() => {}}
        onReload={() => window.location.reload()}
        onExit={() => save(initial())}
        onReward={() => save(initial(b.bossId, view.profile))}
        demo
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 80,
          display: "flex",
          gap: 8,
          justifyContent: "center",
          flexWrap: "wrap",
          background: "#122132",
          padding: 8,
          color: "white",
          fontSize: 12,
        }}
      >
        <span>ทดลองเท่านั้น · โจทย์ตัวอย่าง</span>
        <select
          aria-label="เลือกบอสทดลอง"
          value={b.bossId}
          onChange={(e) =>
            save(initial(e.target.value as BossId, view.profile))
          }
        >
          {Object.entries(BOSSES).map(([id, boss]) => (
            <option key={id} value={id}>
              {boss.level}
            </option>
          ))}
        </select>
        <select
          aria-label="เลือกชุดทดลอง"
          value={view.profile}
          onChange={(e) => save(initial(b.bossId, e.target.value as Profile))}
        >
          {Object.keys(PROFILES).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button onClick={() => save(initial(b.bossId, view.profile))}>
          เริ่มใหม่
        </button>
      </div>
    </>
  );
}
