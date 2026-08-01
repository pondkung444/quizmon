"use client";

import { useState } from "react";
import {
  submitFeedback,
  getRecentWrongQuestions,
  type Mood,
  type Friction,
  type ContentDifficulty,
  type GraphicsRating,
  type GraphicsIssue,
  type Want,
  type WrongQuestionOption,
} from "@/app/feedback/actions";
import { track } from "@/lib/analytics";

type Step =
  | "mood"
  | "friction"
  | "difficulty"
  | "flagged"
  | "graphics"
  | "graphicsIssues"
  | "wants"
  | "freeText";

const MOOD_OPTIONS: { id: Mood; emoji: string; label: string }[] = [
  { id: "great", emoji: "🤩", label: "ชอบมาก" },
  { id: "good", emoji: "🙂", label: "ดี" },
  { id: "neutral", emoji: "😐", label: "เฉยๆ" },
  { id: "bad", emoji: "😞", label: "ไม่ชอบ" },
];

const FRICTION_OPTIONS: { id: Friction; label: string }[] = [
  { id: "no_start_button", label: "หาไม่เจอว่าจะเริ่มฝึกยังไง" },
  { id: "pet_growth_unclear", label: "งงว่า Qmon โตได้ยังไง" },
  { id: "exp_unclear", label: "ไม่เข้าใจระบบ EXP" },
  { id: "none", label: "ไม่มีปัญหาอะไรเลย" },
];

const DIFFICULTY_OPTIONS: { id: ContentDifficulty; label: string }[] = [
  { id: "good", label: "กำลังดี" },
  { id: "hard", label: "ยากไปนิด" },
  { id: "too_hard", label: "ยากเกินไป" },
];

const GRAPHICS_OPTIONS: { id: GraphicsRating; emoji: string; label: string }[] = [
  { id: "love", emoji: "😍", label: "ชอบมาก" },
  { id: "good", emoji: "🙂", label: "ดี" },
  { id: "neutral", emoji: "😐", label: "เฉยๆ" },
  { id: "dislike", emoji: "😕", label: "ไม่ชอบ" },
];

const GRAPHICS_ISSUE_OPTIONS: { id: GraphicsIssue; label: string }[] = [
  { id: "sprites_similar", label: "ตัว Qmon หน้าตาคล้ายกันไปหมด" },
  { id: "theme_dull", label: "ธีมสี/ดีไซน์ดูจืดไป" },
  { id: "text_hard_read", label: "ตัวหนังสืออ่านยาก" },
  { id: "effects_plain", label: "เอฟเฟกต์ธรรมดาไปหน่อย" },
  { id: "none", label: "ไม่มีปัญหาอะไรเลย" },
];

const WANT_OPTIONS: { id: Want; label: string }[] = [
  { id: "more_subjects", label: "อยากได้วิชาเพิ่ม" },
  { id: "more_qmon_chat", label: "อยากคุยกับ Qmon เยอะขึ้น" },
  { id: "see_classmates", label: "อยากเห็นเพื่อนร่วมห้อง" },
  { id: "other", label: "อื่นๆ" },
];

const FREE_TEXT_MAX = 60;

function toggleInArray<T>(list: T[], id: T, isNone: (v: T) => boolean): T[] {
  if (isNone(id)) {
    // เลือก "ไม่มีปัญหาอะไรเลย" ล้างตัวเลือกอื่นทั้งหมด (คนละความหมายกัน เลือกพร้อมกันไม่ได้)
    return list.includes(id) ? [] : [id];
  }
  const withoutNone = list.filter((v) => !isNone(v));
  return withoutNone.includes(id) ? withoutNone.filter((v) => v !== id) : [...withoutNone, id];
}

export default function FeedbackModal({ petId, onClose }: { petId: string | null; onClose: () => void }) {
  const [step, setStep] = useState<Step>("mood");
  const [mood, setMood] = useState<Mood | null>(null);
  const [friction, setFriction] = useState<Friction[]>([]);
  const [difficulty, setDifficulty] = useState<ContentDifficulty | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<number[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestionOption[]>([]);
  const [loadingWrongQuestions, setLoadingWrongQuestions] = useState(false);
  const [graphicsRating, setGraphicsRating] = useState<GraphicsRating | null>(null);
  const [graphicsIssues, setGraphicsIssues] = useState<GraphicsIssue[]>([]);
  const [wants, setWants] = useState<Want[]>([]);
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleMood(value: Mood) {
    setMood(value);
    setStep("friction");
  }

  function handleDifficulty(value: ContentDifficulty) {
    setDifficulty(value);
    if (value === "too_hard") {
      setStep("flagged");
      setLoadingWrongQuestions(true);
      getRecentWrongQuestions()
        .then(setWrongQuestions)
        .catch(() => setWrongQuestions([]))
        .finally(() => setLoadingWrongQuestions(false));
    } else {
      setStep("graphics");
    }
  }

  function handleGraphics(value: GraphicsRating) {
    setGraphicsRating(value);
    setStep(value === "neutral" || value === "dislike" ? "graphicsIssues" : "wants");
  }

  async function handleFinish(finalFreeText: string | null) {
    if (!mood || !difficulty || !graphicsRating) return; // step บังคับครบแล้วเสมอตอนถึงจุดนี้
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback({
        mood,
        friction,
        content_difficulty: difficulty,
        flagged_question_ids: flaggedIds,
        graphics_rating: graphicsRating,
        graphics_issues: graphicsIssues,
        wants,
        free_text: finalFreeText,
      });
      // เรียก track() จาก client เท่านั้นหลัง action resolve (server action เรียกเป็น no-op)
      track("feedback_submitted", { mood, content_difficulty: difficulty, graphics_rating: graphicsRating }, petId);
      onClose();
    } catch {
      setError("ส่งไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="relative flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-gold-dim bg-card p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-text3 transition active:scale-95"
        >
          ✕
        </button>

        {step === "mood" && (
          <>
            <div className="text-center">
              <p className="text-sm text-text3">ขอความเห็นแป๊บนึงนะ</p>
              <h2 className="mt-1 text-lg font-bold text-gold-hi">เล่นเกมนี้แล้วรู้สึกยังไงบ้าง?</h2>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MOOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleMood(opt.id)}
                  className="flex flex-col items-center gap-1 rounded-2xl border border-gold-dim bg-track py-4 text-xs font-medium text-text2 transition hover:border-gold active:scale-95"
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "friction" && (
          <MultiSelectStep
            title="มีอะไรที่ใช้งานยาก/งงบ้างไหม?"
            options={FRICTION_OPTIONS}
            selected={friction}
            onToggle={(id) => setFriction((prev) => toggleInArray(prev, id, (v) => v === "none"))}
            onNext={() => setStep("difficulty")}
          />
        )}

        {step === "difficulty" && (
          <>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gold-hi">โจทย์ที่ตอบไปวันนี้ยากแค่ไหน?</h2>
            </div>
            <div className="flex flex-col gap-3">
              {DIFFICULTY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleDifficulty(opt.id)}
                  className="rounded-2xl border border-gold-dim bg-track py-4 text-base font-medium text-text transition hover:border-gold active:scale-95"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "flagged" && (
          <>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gold-hi">มีข้อไหนที่ยากเป็นพิเศษไหม?</h2>
              <p className="mt-1 text-xs text-text3">แตะเลือกได้ (ไม่บังคับ)</p>
            </div>
            {loadingWrongQuestions ? (
              <p className="text-center text-sm text-text3">กำลังโหลด...</p>
            ) : wrongQuestions.length === 0 ? (
              <p className="text-center text-sm text-text3">ไม่มีข้อที่ตอบผิดล่าสุดให้เลือกนะ</p>
            ) : (
              <div className="flex flex-col gap-2">
                {wrongQuestions.map((q) => {
                  const isSelected = flaggedIds.includes(q.id);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() =>
                        setFlaggedIds((prev) => (isSelected ? prev.filter((id) => id !== q.id) : [...prev, q.id]))
                      }
                      className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition active:scale-95 ${
                        isSelected ? "border-amber bg-amber/10 text-gold-hi" : "border-border bg-track text-text2 hover:border-gold-dim"
                      }`}
                    >
                      <p className="text-xs text-text3">{q.category}</p>
                      {q.questionText}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("graphics")}
                className="flex-1 rounded-2xl border-2 border-border py-3 text-sm font-bold text-text2 transition active:scale-95"
              >
                ข้าม
              </button>
              <button
                type="button"
                onClick={() => setStep("graphics")}
                className="flex-1 rounded-2xl border border-gold bg-amber py-3 text-sm font-bold text-track transition active:scale-95"
              >
                ถัดไป
              </button>
            </div>
          </>
        )}

        {step === "graphics" && (
          <>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gold-hi">ชอบภาพ/ดีไซน์ของเกมแค่ไหน?</h2>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {GRAPHICS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleGraphics(opt.id)}
                  className="flex flex-col items-center gap-1 rounded-2xl border border-gold-dim bg-track py-4 text-xs font-medium text-text2 transition hover:border-gold active:scale-95"
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "graphicsIssues" && (
          <MultiSelectStep
            title="ภาพ/ดีไซน์ตรงไหนที่ยังไม่ชอบ?"
            options={GRAPHICS_ISSUE_OPTIONS}
            selected={graphicsIssues}
            onToggle={(id) => setGraphicsIssues((prev) => toggleInArray(prev, id, (v) => v === "none"))}
            onNext={() => setStep("wants")}
          />
        )}

        {step === "wants" && (
          <MultiSelectStep
            title="อยากให้เกมนี้มีอะไรเพิ่ม?"
            options={WANT_OPTIONS}
            selected={wants}
            onToggle={(id) => setWants((prev) => toggleInArray(prev, id, () => false))}
            onNext={() => setStep("freeText")}
          />
        )}

        {step === "freeText" && (
          <>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gold-hi">อยากบอกอะไรเราอีกไหม?</h2>
              <p className="mt-1 text-xs text-text3">ไม่บังคับ พิมพ์สั้นๆ ก็ได้</p>
            </div>
            <div>
              <input
                type="text"
                value={freeText}
                maxLength={FREE_TEXT_MAX}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="พิมพ์ตรงนี้..."
                className="w-full rounded-2xl border border-gold-dim bg-track px-4 py-3 text-sm text-text outline-none focus:border-gold"
              />
              <p className="mt-1 text-right text-xs text-text3">
                {freeText.length}/{FREE_TEXT_MAX}
              </p>
            </div>
            {error && <p className="text-center text-sm text-red">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleFinish(null)}
                className="flex-1 rounded-2xl border-2 border-border py-3 text-sm font-bold text-text2 transition active:scale-95 disabled:opacity-50"
              >
                ข้าม
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleFinish(freeText.trim() === "" ? null : freeText.trim())}
                className="flex-1 rounded-2xl border border-gold bg-amber py-3 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
              >
                {submitting ? "กำลังส่ง..." : "เสร็จแล้ว"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MultiSelectStep<T extends string>({
  title,
  options,
  selected,
  onToggle,
  onNext,
}: {
  title: string;
  options: { id: T; label: string }[];
  selected: T[];
  onToggle: (id: T) => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="text-center">
        <h2 className="text-lg font-bold text-gold-hi">{title}</h2>
        <p className="mt-1 text-xs text-text3">แตะเลือกได้หลายข้อ (ไม่บังคับ)</p>
      </div>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition active:scale-95 ${
                isSelected ? "border-amber bg-amber/10 text-gold-hi" : "border-border bg-track text-text2 hover:border-gold-dim"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-2xl border-2 border-border py-3 text-sm font-bold text-text2 transition active:scale-95"
        >
          ข้าม
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-2xl border border-gold bg-amber py-3 text-sm font-bold text-track transition active:scale-95"
        >
          ถัดไป
        </button>
      </div>
    </>
  );
}
