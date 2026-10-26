"use client";

import { forwardRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { STARDUST_TEXT } from "@/lib/stardust";
import { StarIcon } from "@/components/quiz/stardust/StarShape";

export type AnswerSheetContent = {
  correct: boolean;
  line: string;
  expEarned: number;
  answerText: string | null;
  explanation: string | null;
  isLast: boolean;
};

// แผ่นผลเลื่อนขึ้นจากล่าง (มือถือตั้ง) / ลอยในคอลัมน์ขวา (จอเตี้ยแนวนอน) / อยู่ใต้ตัวเลือก (จอกว้าง) — ดู .sd-sheet
// leaving = สำเนาของแผ่นเดิมที่กำลังเลื่อนลงหลังกด "ไปต่อ" (state ไปข้อถัดไปแล้ว แผ่นนี้แค่ภาพ)
const AnswerSheet = forwardRef<
  HTMLDivElement,
  {
    content: AnswerSheetContent;
    isEgg: boolean;
    img: string | null;
    gradientId: string;
    onNext?: () => void;
    nextDisabled?: boolean;
    saving?: boolean;
    footer?: ReactNode;
    leaving?: boolean;
    onLeft?: () => void;
  }
>(function AnswerSheet({ content, isEgg, img, gradientId, onNext, nextDisabled, saving, footer, leaving, onLeft }, ref) {
  const [imgFailed, setImgFailed] = useState(false);
  const T = STARDUST_TEXT;
  return (
    <div
      ref={ref}
      className={`sd-sheet ${content.correct ? "ok" : "miss"}${leaving ? " sd-leaving" : ""}`}
      role={leaving ? undefined : "status"}
      aria-live={leaving ? undefined : "polite"}
      aria-hidden={leaving || undefined}
      onAnimationEnd={leaving ? (e) => e.target === e.currentTarget && onLeft?.() : undefined}
    >
      <div className={`sd-say${isEgg ? " egg" : ""}`}>
        {img && !imgFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" onError={() => setImgFailed(true)} />
        )}
        <p className="sd-bubble">{content.line}</p>
      </div>
      <div className="sd-res">
        <h3>{content.correct ? T.correct : T.wrong}</h3>
        {content.correct && content.expEarned > 0 && (
          <span className="sd-exp-pill">
            <StarIcon gradientId={gradientId} />+{content.expEarned} EXP
          </span>
        )}
      </div>
      {content.answerText && <p className="sd-ans">{content.answerText}</p>}
      {content.explanation && (
        <p className="sd-why" tabIndex={0}>
          {content.explanation}
        </p>
      )}
      {footer}
      {onNext && (
        <button type="button" className="sd-btn" onClick={onNext} disabled={nextDisabled} tabIndex={leaving ? -1 : undefined}>
          {saving ? T.saving : content.isLast ? T.lastNext : T.next}
          {!saving && <ChevronRight strokeWidth={3} aria-hidden />}
        </button>
      )}
    </div>
  );
});

export default AnswerSheet;
