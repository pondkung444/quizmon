"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eggCracksBefore, type StardustElement, type StardustPreviewKind } from "@/lib/stardust";
import StardustPlay, { type StardustQuestionData, type StardustResult } from "@/components/quiz/stardust/StardustPlay";
import StardustEnd from "@/components/quiz/stardust/StardustEnd";

// ?stardustPreview= (ไม่ใช่ production เท่านั้น — quiz/page.tsx กันไว้) ข้อมูลตัวอย่างล้วน ไม่ยิง server action ไม่ยิง event
// เล่นต่อได้ในเครื่อง (ตอบ/ไปต่อ/จบรอบ) เพื่อดู animation · ค่าตามต้นแบบ .oil-ui/quiz-play/proto/app.js
const TRIANGLE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300"><rect width="480" height="300" fill="#fafaf8"/><polygon points="70,250 410,250 250,50" fill="#e8f1fb" stroke="#23324a" stroke-width="3" stroke-linejoin="round"/><path d="M112,250 A42,42 0 0 0 103,222" fill="none" stroke="#2b5cad" stroke-width="2.5"/><path d="M370,250 A40,40 0 0 1 385,219" fill="none" stroke="#2b5cad" stroke-width="2.5"/><path d="M234,70 A26,26 0 0 0 268,72" fill="none" stroke="#c2410c" stroke-width="2.5"/><g font-family="Kanit, sans-serif" font-size="22" fill="#23324a"><text x="46" y="276">A</text><text x="414" y="276">B</text><text x="242" y="38">C</text></g><g font-family="Kanit, sans-serif" font-size="19" fill="#2b5cad"><text x="120" y="238">50°</text><text x="320" y="238">70°</text></g><text x="240" y="104" font-family="Kanit, sans-serif" font-size="20" fill="#c2410c" text-anchor="middle">?</text></svg>`
  );

type Q = StardustQuestionData & { ok: number; why: string };
const QUESTIONS: Q[] = [
  { id: 1, category: "เลขยกกำลัง", question_text: "ค่าของ 3² + 4² เท่ากับเท่าใด", image_url: null, choices: ["25", "49", "14", "12"], ok: 0, why: "3² = 9 และ 4² = 16 รวมกันได้ 9 + 16 = 25" },
  { id: 2, category: "มุมในสามเหลี่ยม", question_text: "จากรูป สามเหลี่ยม ABC มีมุม A = 50° และมุม B = 70° มุม C มีขนาดกี่องศา", image_url: TRIANGLE, choices: ["50°", "60°", "70°", "80°"], ok: 1, why: "มุมภายในสามเหลี่ยมรวมกันได้ 180° จึงได้ 180 − 50 − 70 = 60°" },
  { id: 3, category: "จำนวนเฉพาะ", question_text: "ข้อใดเป็นจำนวนเฉพาะ", image_url: null, choices: ["21", "27", "29", "33"], ok: 2, why: "29 หารลงตัวด้วย 1 กับ 29 เท่านั้น ส่วน 21 = 3 × 7, 27 = 3 × 9 และ 33 = 3 × 11" },
  { id: 4, category: "สมการเชิงเส้นตัวแปรเดียว", question_text: "ถ้า 2x + 5 = 17 แล้ว x มีค่าเท่าใด", image_url: null, choices: ["5", "6", "7", "11"], ok: 1, why: "ย้าย 5 ไปอีกข้างได้ 2x = 12 แล้วหารด้วย 2 ทั้งสองข้าง ได้ x = 6" },
  { id: 5, category: "เศษส่วนและทศนิยม", question_text: "เศษส่วนใดมีค่าเท่ากับ 0.75", image_url: null, choices: ["3/5", "2/3", "3/4", "7/10"], ok: 2, why: "0.75 = 75/100 ตัดทอนด้วย 25 ได้ 3/4" },
];

const expFor = (combo: number) => (combo >= 3 ? 11 : 10);

function initial(kind: StardustPreviewKind) {
  const at = (results: boolean[], idx: number, pick?: number) => ({ results, idx, pick, ended: false });
  switch (kind) {
    case "egg-intro": return at([], 0);
    case "egg": return at([true, false], 2, QUESTIONS[2].ok);
    case "image": return at([true], 1);
    case "correct": return at([true, true], 2, QUESTIONS[2].ok);
    case "wrong": return at([true, true, true], 3, 2);
    case "end":
    case "egg-end": return { results: [true, true, false, true, true], idx: 4, pick: undefined, ended: true };
  }
}

export default function StardustPreview({
  kind,
  element,
  prior = 0,
  petImg,
  eggImg,
}: {
  kind: StardustPreviewKind;
  element: StardustElement;
  prior?: number;
  petImg: string;
  eggImg: string;
}) {
  const router = useRouter();
  const isEgg = kind.startsWith("egg");
  const pet = isEgg ? { name: "ไข่", stage: 1, exp: 10 } : { name: "ข้าวปั้น", stage: 2, exp: 230 };
  const start = initial(kind);
  // answers[i] = ผลข้อ i · ข้อที่ preset ให้ตอบแล้ว (pick) ใส่ผลไว้ตั้งแต่ต้น
  const [answers, setAnswers] = useState<boolean[]>(() =>
    start.pick === undefined ? start.results : [...start.results, start.pick === QUESTIONS[start.idx].ok]
  );
  const [idx, setIdx] = useState(start.idx);
  const [selected, setSelected] = useState<number | null>(start.pick ?? null);
  const [ended, setEnded] = useState(start.ended);
  const [introOpen, setIntroOpen] = useState(kind === "egg-intro");
  const comboAt = (list: boolean[]) => {
    let c = 0;
    for (let i = list.length - 1; i >= 0 && list[i]; i--) c++;
    return c;
  };
  const q = QUESTIONS[idx];
  const answered = answers.length > idx;
  const combo = comboAt(answers);
  const result: StardustResult | null = answered
    ? { correct: answers[idx], correctIndex: q.ok, explanation: q.why, expEarned: answers[idx] ? expFor(combo) : 0 }
    : null;
  const gain = answers.reduce((sum, ok, i) => sum + (ok ? expFor(comboAt(answers.slice(0, i + 1))) : 0), 0);

  function reset() {
    setAnswers([]);
    setIdx(0);
    setSelected(null);
    setEnded(false);
  }

  if (ended) {
    return (
      <div data-app-wide data-stardust data-element={element} className="quiz-play">
        <StardustEnd
          element={element}
          isEgg={isEgg}
          img={isEgg ? eggImg : petImg}
          name={pet.name}
          stage={pet.stage}
          expBefore={pet.exp}
          results={answers}
          total={prior + QUESTIONS.length}
          priorCount={prior}
          correctCount={prior + answers.filter(Boolean).length}
          gainExp={gain}
          expAddedToPet={gain}
          evolved={false}
          toStage={null}
          capped={false}
          missionBonusExp={null}
          farmCoins={null}
          saveWarning={null}
          missionClaimFailed={false}
          missedCount={answers.filter((a) => !a).length}
          onReview={() => {}}
          onPlayAgain={reset}
          onBack={() => router.push("/pet")}
          onGoHatch={() => router.push("/pet")}
        />
      </div>
    );
  }

  return (
    <div data-app-wide data-stardust data-element={element} className="quiz-play">
      <StardustPlay
        isEgg={isEgg}
        img={isEgg ? eggImg : petImg}
        cracksBefore={isEgg ? eggCracksBefore(pet.exp) : 0}
        question={q}
        index={idx}
        total={prior + QUESTIONS.length}
        priorCount={prior}
        results={answers}
        isMission={true}
        selectedChoice={selected}
        result={result}
        combo={combo}
        isLast={idx === QUESTIONS.length - 1}
        choicesDisabled={answered}
        nextDisabled={false}
        saving={false}
        showIntro={introOpen}
        onIntroDone={() => setIntroOpen(false)}
        onSelect={(i) => {
          if (answered) return;
          setSelected(i);
          setAnswers((prev) => [...prev, i === q.ok]);
        }}
        onNext={() => {
          if (!answered) return;
          if (idx === QUESTIONS.length - 1) setEnded(true);
          else {
            setIdx(idx + 1);
            setSelected(null);
            window.scrollTo({ top: 0, behavior: "instant" });
          }
        }}
        onExit={() => router.push("/pet")}
      />
    </div>
  );
}
