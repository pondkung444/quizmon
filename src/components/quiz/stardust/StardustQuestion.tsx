import type { ReactNode } from "react";
import QuestionImageZoom from "@/components/quiz/stardust/QuestionImageZoom";

// แถว meta ("ภารกิจวันนี้ / ฝึกฝน · ข้อ x จาก y" + หมวด) + ป้ายทบทวน/ผู้พิทักษ์ (badges) + การ์ดโจทย์ + รูป
export default function StardustQuestion({
  meta,
  category,
  badges,
  text,
  imageUrl,
  questionKey,
}: {
  meta: string;
  category: string;
  badges?: ReactNode;
  text: string;
  imageUrl: string | null;
  questionKey: number | string;
}) {
  return (
    <>
      <div className="sd-meta">
        <span className="sd-meta-k">{meta}</span>
        <span className="sd-chip">{category}</span>
      </div>
      {badges}
      <article key={questionKey} className="sd-qcard sd-enter">
        <h2 className="sd-qtext">{text}</h2>
        {imageUrl && <QuestionImageZoom key={questionKey} src={imageUrl} />}
      </article>
    </>
  );
}
