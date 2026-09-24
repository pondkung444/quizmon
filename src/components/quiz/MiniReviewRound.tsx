"use client";

import { useState } from "react";
import type { QuizRoundQuestion } from "@/types/quiz";
import { createLearningFeedback, type LearningFeedback } from "@/lib/learningFeedback";
import QuizQuestionImage from "@/components/quiz/QuizQuestionImage";

const LABELS = ["ก", "ข", "ค", "ง"];

export default function MiniReviewRound({ questions, onDone }: { questions: QuizRoundQuestion[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<LearningFeedback | null>(null);
  const current = questions[index];

  function answer(selectedIndex: number) {
    if (feedback) return;
    setFeedback(createLearningFeedback(selectedIndex, current.correctIndex, current.explanation));
  }

  function next() {
    if (index + 1 >= questions.length) {
      onDone();
      return;
    }
    setIndex((value) => value + 1);
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return <section className="flex flex-col gap-4 pb-24">
    <div>
      <p className="text-xs font-bold text-amber">ทบทวนสั้น · ไม่คิดคะแนนเพิ่ม</p>
      <h1 className="mt-1 font-sarabun text-2xl font-bold text-gold-hi">ลองข้อที่พลาดอีกครั้ง</h1>
      <p className="mt-1 text-sm text-text3">ข้อที่ {index + 1}/{questions.length} · คำตอบรอบนี้จะไม่บันทึกซ้ำ</p>
    </div>

    <div className="rounded-3xl border border-gold-dim bg-card p-4">
      <p className="font-sarabun text-lg font-bold leading-relaxed text-text">{current.question_text}</p>
      {current.image_url && <div className="mt-3"><QuizQuestionImage src={current.image_url} /></div>}
    </div>

    <div className="flex flex-col gap-2">
      {current.choices.map((choice, choiceIndex) => {
        const selected = feedback?.selectedIndex === choiceIndex;
        const correct = feedback?.correctIndex === choiceIndex;
        const wrong = Boolean(feedback && selected && !correct);
        const style = correct ? "border-emerald-400 bg-emerald-400/10" : wrong ? "border-red bg-red/10" : "border-border bg-card";
        return <button key={choiceIndex} type="button" disabled={Boolean(feedback)} aria-pressed={selected} onClick={() => answer(choiceIndex)} className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-sarabun text-base text-text disabled:opacity-100 ${style}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-track text-sm font-bold text-text2">{LABELS[choiceIndex] ?? choiceIndex + 1}</span>
          <span className="min-w-0 flex-1 break-words">{choice}</span>
          {correct && <strong className="text-xs text-emerald-200">คำตอบที่ถูก</strong>}
          {wrong && <strong className="text-xs text-red">คำตอบของเรา</strong>}
        </button>;
      })}
    </div>

    {feedback && <div className="flex flex-col gap-3" role="status">
      <p className={`rounded-2xl border p-4 font-bold ${feedback.correct ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-border bg-card text-text"}`}>
        {feedback.correct ? "ถูกต้อง — จำหลักนี้ได้แล้ว!" : "ยังไม่ตรง ลองอ่านเหตุผลอีกครั้งนะ"}
      </p>
      <div className="rounded-2xl bg-track p-4 text-sm leading-relaxed text-text2">
        <strong className="text-gold-hi">เหตุผล</strong>
        <p className="mt-1">{feedback.explanation || "คำตอบที่ถูกคือ " + current.choices[feedback.correctIndex]}</p>
      </div>
      <button type="button" onClick={next} className="min-h-12 rounded-2xl border border-gold bg-amber px-4 text-lg font-bold text-on-amber shadow-lg active:scale-95">
        {index + 1 >= questions.length ? "กลับไปดูสรุป" : "ข้อทบทวนถัดไป →"}
      </button>
    </div>}
  </section>;
}
