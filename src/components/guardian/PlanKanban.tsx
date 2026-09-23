"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical, Trash2 } from "lucide-react";
import { bufferPhrase, bufferSummary, formatRange, formatShortDate, type ExamInfo, type PlacedChapter, type SubjectSchedule, type WeekInfo } from "@/lib/planSchedule";
import { PlanTimelineLegend } from "@/components/guardian/PlanTimeline";

// คณิต = indigo, วิทย์ = sci, "ผ่านแล้ว" = good (สงวนไว้) — แถบสีซ้ายการ์ดบอกวิชา ไม่แยกแถวตามวิชา
const SUBJECT_BAR: Record<string, string> = { math: "border-l-indigo", science: "border-l-sci" };

function cardClass(status: PlacedChapter["status"]): string {
  switch (status) {
    case "passed":
      return "border-good/40 bg-good/10";
    case "current":
      return "border-amber/70 bg-amber/10";
    case "stuck":
      return "border-red bg-red/10";
    default:
      return "border-border bg-track";
  }
}

function CardBody({ c }: { c: PlacedChapter }) {
  return (
    <div className="min-w-0 flex-1">
      <p className={`text-sm leading-snug ${c.status === "current" ? "font-bold text-text" : "text-text"}`}>{c.chapter}</p>
      {c.status === "passed" && <p className="mt-0.5 text-[11px] font-semibold text-good">ผ่านแล้ว</p>}
      {c.status === "current" && <p className="mt-0.5 text-[11px] font-semibold text-amber">กำลังเรียน</p>}
      {c.status === "stuck" && <p className="mt-0.5 text-[11px] font-bold text-red">ค้างนาน</p>}
    </div>
  );
}

function ChapterCard({
  c,
  subject,
  onRemove,
  disabled,
}: {
  c: PlacedChapter;
  subject: string;
  onRemove: (key: string) => void;
  disabled: boolean;
}) {
  // ทุกสถานะลากได้ (ยกเว้นบทที่ผ่านมาก่อนแผน ซึ่งไม่ได้อยู่ในกริดนี้อยู่แล้ว — แยกโชว์เป็น badge ต่างหาก)
  const draggable = !disabled;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: c.chapter_key,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-2 rounded-xl border border-l-4 p-2.5 ${SUBJECT_BAR[subject] ?? "border-l-text3"} ${cardClass(c.status)} ${isDragging ? "opacity-30" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        disabled={!draggable}
        aria-label={`ลากเพื่อย้ายบท ${c.chapter}`}
        style={{ touchAction: "none" }}
        className="-m-1 flex h-8 w-8 flex-none cursor-grab items-center justify-center rounded-lg text-text3 active:cursor-grabbing disabled:opacity-30"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <CardBody c={c} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRemove(c.chapter_key)}
        aria-label={`ลบบท ${c.chapter} ออกจากแผน`}
        className="-m-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg text-red/80 disabled:opacity-30"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function WeekColumn({
  week,
  items,
  isPast,
  onRemove,
  disabled,
}: {
  week: WeekInfo;
  items: { c: PlacedChapter; subject: string }[];
  isPast: boolean;
  onRemove: (key: string) => void;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `week-${week.index}`, disabled: isPast });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card ${
        week.isCurrent ? "border-amber" : "border-border"
      } ${isOver ? "outline outline-2 -outline-offset-2 outline-dashed outline-amber" : ""}`}
    >
      <div className={`border-b border-border px-3 py-2 ${week.isCurrent ? "bg-amber/15" : ""}`}>
        <p className={`text-sm font-extrabold ${week.isCurrent ? "text-amber" : "text-text"}`}>
          สัปดาห์ {week.index + 1}
          {week.isCurrent && " · ตอนนี้"}
        </p>
        <p className="text-[11px] text-text3">{formatRange(week.startYmd, week.endYmd)}</p>
      </div>
      <div className="flex min-h-[160px] flex-1 flex-col gap-2 p-2.5">
        {items.map(({ c, subject }) => (
          <ChapterCard key={c.chapter_key} c={c} subject={subject} onRemove={onRemove} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}

// ตารางหลายแถว: pointerWithin ก่อน (ตรงกับที่นิ้ว/เมาส์ชี้จริง) แล้ว fallback rectIntersection (คีย์บอร์ดไม่มี pointer)
const collision: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  return hit.length > 0 ? hit : rectIntersection(args);
};

// ปฏิทินแผนฝึกแบบ Kanban: คอลัมน์ต่อสัปดาห์ ลากบท (ทุกสถานะ — ผ่านแล้ว/กำลังเรียน/ค้างนาน/รอคิว) ไปวาง
// สัปดาห์ที่ต้องการ (เปลี่ยนลำดับคิวในวิชาเดียวกัน แล้วให้ planSchedule คำนวณสัปดาห์ใหม่) — บทที่ผ่านมาก่อน
// แผน (badge แยกต่างหาก) ไม่อยู่ในกริดนี้ เลยลากไม่ได้อยู่แล้ว
export default function PlanKanban({
  weeks,
  schedules,
  exam,
  busy,
  onMove,
  onRemove,
}: {
  weeks: WeekInfo[];
  schedules: SubjectSchedule[];
  exam: ExamInfo | null;
  busy: boolean;
  onMove: (chapterKey: string, targetWeek: number) => void;
  onRemove: (chapterKey: string) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const all = schedules.flatMap((s) => s.placed.map((c) => ({ c, subject: s.subject })));
  const active = all.find((x) => x.c.chapter_key === activeKey) ?? null;
  const curIdx = weeks.find((w) => w.isCurrent)?.index ?? 0;
  const beforePlan = schedules.filter((s) => s.beforePlan.length > 0);

  function handleDragEnd(e: DragEndEvent) {
    setActiveKey(null);
    const over = e.over?.id;
    if (typeof over !== "string" || !over.startsWith("week-")) return;
    onMove(String(e.active.id), Number(over.slice(5)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-text">ปฏิทินแผนฝึก</p>
          <p className="text-xs text-text3">
            ตำแหน่งสัปดาห์เป็นค่าประมาณ ปรับเองได้โดยลากบทไปมา (ลากที่ไอคอน ⋮⋮ · ย้ายได้เฉพาะในวิชาเดียวกัน)
          </p>
        </div>
        {exam && (
          <div className="sm:text-right">
            <p className="text-sm font-bold text-red">
              🚩 สอบ {formatShortDate(exam.examYmd)}
              {exam.daysToExam >= 0 ? ` · อีก ${exam.daysToExam} วัน` : ""}
            </p>
            <p className={`text-xs ${bufferSummary(exam).ok ? "text-text2" : "font-semibold text-red"}`}>
              {bufferSummary(exam).text}
            </p>
          </div>
        )}
      </div>

      {beforePlan.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {beforePlan.map((s) => (
            <span key={s.subject} className="rounded-full border border-good/60 bg-good/10 px-2.5 py-1 text-xs text-good">
              ✓ ผ่านมาก่อนแผน {s.beforePlan.length} บท ({s.subject === "science" ? "วิทย์" : "คณิต"})
            </span>
          ))}
        </div>
      )}

      <PlanTimelineLegend />

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e: DragStartEvent) => setActiveKey(String(e.active.id))}
        onDragCancel={() => setActiveKey(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {weeks.map((w) => (
            <WeekColumn
              key={w.index}
              week={w}
              isPast={w.index < curIdx}
              items={all.filter((x) => x.c.weekIndex === w.index)}
              onRemove={onRemove}
              disabled={busy}
            />
          ))}
          {exam && (
            <div className="flex min-w-0 flex-col items-center overflow-hidden rounded-2xl border border-red/40 bg-red/5">
              <div className="w-full border-b border-red/30 px-3 py-2 text-center">
                <p className="text-sm font-extrabold text-red">🚩 วันสอบ</p>
                <p className="text-[11px] text-red/80">{formatShortDate(exam.examYmd)}</p>
              </div>
              <p className="flex flex-1 items-center p-3 text-center text-xs leading-relaxed text-text3">
                {exam.bufferDays > 0
                  ? `เผื่อทบทวน ${bufferPhrase(exam.bufferDays)} หลังแผนจบ`
                  : exam.bufferDays === 0
                    ? "แผนจบใกล้วันสอบพอดี"
                    : "แผนอาจยาวเกินเวลาที่เหลือ ลองปรับลดสัปดาห์"}
              </p>
            </div>
          )}
        </div>
        <DragOverlay>
          {active ? (
            <div
              className={`flex items-start gap-2 rounded-xl border-2 border-dashed border-amber bg-amber/20 p-2.5 shadow-xl ${SUBJECT_BAR[active.subject] ?? ""} border-l-4`}
              style={{ width: 196, transform: "rotate(-2deg)" }}
            >
              <GripVertical className="mt-0.5 h-4 w-4 flex-none text-amber" />
              <p className="text-sm font-bold leading-snug text-amber">{active.c.chapter}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
