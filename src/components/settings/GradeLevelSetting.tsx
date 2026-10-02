"use client";

import { useState, useTransition } from "react";
import { updateGradeLevel } from "@/app/settings/actions";
import { ALL_GRADE_LEVELS, SELECTABLE_GRADE_LEVELS } from "@/lib/gradeLevel";

type Feedback =
  | { kind: "saved" }
  | { kind: "error"; text: string }
  | { kind: "confirm"; target: string }
  | null;

export default function GradeLevelSetting({ current }: { current: string | null }) {
  const [saved, setSaved] = useState(current);
  const [selected, setSelected] = useState(current ?? "");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  // ผู้ใช้ ป.x เห็นทั้ง ป.4-6 และ ม.1-6 (ให้ค่าปัจจุบันแสดงถูก); ผู้ใช้ ม.x/null เลือก ป.x เองไม่ได้
  const fromPrimary = (saved ?? "").startsWith("ป.");
  const levels = fromPrimary ? ALL_GRADE_LEVELS : SELECTABLE_GRADE_LEVELS;

  function save(target: string, confirmBandChange: boolean) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await updateGradeLevel({ gradeLevel: target, confirmBandChange });
        if (result.ok) {
          setSaved(result.gradeLevel);
          setSelected(result.gradeLevel);
          setFeedback({ kind: "saved" });
          return;
        }
        if (result.reason === "needs_confirm") {
          // ค้างค่าที่เลือกไว้ให้เห็นระหว่างรอกดยืนยัน
          setFeedback({ kind: "confirm", target });
          return;
        }
        // ไม่สำเร็จอย่างอื่น -> คืนค่าที่เลือกกลับเป็นค่าที่บันทึกไว้จริง
        setSelected(saved ?? "");
        if (result.reason === "cooldown") {
          setFeedback({
            kind: "error",
            text: `เพิ่งย้ายระหว่าง ${fromPrimary ? "ประถมกับมัธยม" : "ม.ต้น กับ ม.ปลาย"} ไปเมื่อไม่นาน ลองใหม่ได้อีก ${result.retryAfterDays ?? 30} วัน`,
          });
        } else {
          setFeedback({ kind: "error", text: "บันทึกไม่สำเร็จ ลองอีกครั้งนะ" });
        }
      } catch {
        setSelected(saved ?? "");
        setFeedback({ kind: "error", text: "บันทึกไม่สำเร็จ ลองอีกครั้งนะ" });
      }
    });
  }

  function onChange(next: string) {
    setSelected(next);
    if (next && next !== saved) save(next, false);
  }

  return (
    <section className="rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="mb-1 text-sm font-bold text-gold-hi">ระดับชั้น</h2>
      <p className="mb-3 text-xs text-text3">
        {fromPrimary
          ? "ใช้เลือกโจทย์ที่สุ่มให้ตามชั้น ป.4–ป.6"
          : "ใช้เลือกโจทย์ที่สุ่มให้: ม.1 ได้เนื้อหา ม.1, ม.2 ได้ ม.1–ม.2, ม.3 ได้ทุกบทของ ม.ต้น"}
      </p>

      <select
        value={selected}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="ระดับชั้น"
        className="w-full rounded-md border border-border bg-track px-3 py-2 text-sm text-text focus:border-gold focus:outline-none disabled:opacity-60"
      >
        {saved === null && <option value="">-- เลือกระดับชั้น --</option>}
        {levels.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>

      {feedback?.kind === "confirm" && (
        <div className="mt-3 rounded-xl border border-gold-dim bg-track p-3">
          <p className="text-xs text-text2">
            {fromPrimary ? "การย้ายจากชั้นประถมไปมัธยม" : "การย้ายระหว่าง ม.ต้น กับ ม.ปลาย"} จะเปลี่ยนชุดโจทย์ ภารกิจ และกระดานอันดับ
            (คะแนนสัปดาห์นี้จะย้ายไปอยู่กระดานใหม่ด้วย) และจะย้ายอีกครั้งได้หลังจาก 30 วัน
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => save(feedback.target, true)}
              className="flex-1 rounded-lg bg-amber/20 py-2 text-sm font-bold text-gold-hi active:opacity-70 disabled:opacity-60"
            >
              ยืนยันย้ายเป็น {feedback.target}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setSelected(saved ?? "");
                setFeedback(null);
              }}
              className="flex-1 rounded-lg border border-border py-2 text-sm text-text2 active:opacity-70 disabled:opacity-60"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {feedback?.kind === "saved" && <p className="mt-2 text-xs text-text2">บันทึกแล้ว</p>}
      {feedback?.kind === "error" && <p className="mt-2 text-xs text-red">{feedback.text}</p>}
    </section>
  );
}
