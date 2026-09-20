"use client";

import { useEffect, useState } from "react";
import { Check, Feather, Gauge, Flame, Trophy, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ViewerMode } from "@/components/guardian/viewerMode";

type GoalProgress = {
  goal_week_start: string;
  has_goal: boolean;
  goal_level: "relaxed" | "steady" | "challenging" | null;
  bucket: string | null;
  total_questions: number;
  total_correct: number;
};

// สเปกล็อกไว้ที่ §5.7 ของเอกสารออกแบบ — ผู้ปกครองเห็นแค่ label + คำอธิบายภาษาพูด ไม่เห็นตัวเลข
// เป้าจริงหรือ % ใดๆ เลย (เหตุผล: เห็นเลขแล้วจะเอาไปพูดว่า "ไปทำให้ครบ" = เปลี่ยนเป้าเป็นการทวงงาน)
// total_questions/total_correct (เพิ่ม 2026-09-16 ตามคำขอ ปอนด์) เป็นข้อยกเว้นที่ตั้งใจ: ตัวเลข
// ดิบของ "ทำไปกี่ข้อ ถูกกี่ข้อ" ไม่ใช่ตัวเลขเทียบเป้า จึงไม่ชวนให้พูดว่า "ไปทำให้ครบ" แบบที่ spec
// เดิมกังวล — โชว์เป็นข้อมูลเสริมเล็กๆ ใต้การ์ดสถานะหลัก ไม่ใช่จุดเด่นของหน้า
const LEVELS = [
  {
    level: "relaxed" as const,
    label: "สบายๆ",
    description: "พอๆ กับที่ลูกเล่นเป็นปกติอยู่แล้ว",
  },
  {
    level: "steady" as const,
    label: "กำลังดี",
    description: "มากกว่าปกติหน่อย ให้ลูกได้ฝึกเพิ่ม",
  },
  {
    level: "challenging" as const,
    label: "ท้าทาย",
    description: "เต็มที่ เหมาะกับสัปดาห์ที่ลูกพร้อม",
  },
];

// viewerMode="self": คำอธิบายบุรุษที่ 1 (นักเรียนอ่านเอง) — label/level เหมือนเดิม
const LEVELS_SELF = [
  { ...LEVELS[0], description: "พอๆ กับที่เล่นเป็นปกติอยู่แล้ว" },
  { ...LEVELS[1], description: "มากกว่าปกติหน่อย ได้ฝึกเพิ่ม" },
  { ...LEVELS[2], description: "เต็มที่ เหมาะกับสัปดาห์ที่พร้อม" },
];

// ข้อความ bucket มาจาก guardian_get_goal_progress ตรงๆ (ล็อกไว้แล้วใน RPC) — component นี้แค่
// เลือกไอคอน/สีให้ตรงแต่ละขั้น เป็นตัวช่วยภาพสำหรับผู้ปกครองที่อาจไม่ถนัดอ่านตัวหนังสือเยอะๆ
const BUCKET_VISUAL: Record<string, { Icon: typeof Feather; ring: string; text: string }> = {
  ยังไม่เริ่ม: { Icon: Feather, ring: "border-text3", text: "text-text3" },
  เริ่มแล้ว: { Icon: Gauge, ring: "border-amber", text: "text-amber" },
  ไปได้ดี: { Icon: Gauge, ring: "border-gold-hi", text: "text-gold-hi" },
  เกือบถึงแล้ว: { Icon: Flame, ring: "border-gold-hi", text: "text-gold-hi" },
  ถึงเป้าแล้ว: { Icon: Trophy, ring: "border-emerald-400", text: "text-emerald-400" },
};

export default function GoalPanel({
  studentId,
  studentUsername,
  viewerMode = "guardian",
}: {
  studentId: string;
  studentUsername: string;
  viewerMode?: ViewerMode;
}) {
  const isSelf = viewerMode === "self";
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSetLabel, setJustSetLabel] = useState<string | null>(null);

  async function loadProgress() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("guardian_get_goal_progress", {
      p_student_id: studentId,
    });
    if (error) {
      setError(error.message);
    } else {
      setProgress(data?.[0] ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function handleSetLevel(level: "relaxed" | "steady" | "challenging", label: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("guardian_set_goal", {
      p_student_id: studentId,
      p_level: level,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setJustSetLabel(label);
    await loadProgress();
  }

  const visual = progress?.bucket ? BUCKET_VISUAL[progress.bucket] : undefined;
  const StatusIcon = visual?.Icon ?? Feather;
  const hasActivity = !!progress && progress.total_questions > 0;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-base text-text2">
        {isSelf ? (
          "เป้าหมายประจำสัปดาห์ของคุณ"
        ) : (
          <>
            เป้าหมายประจำสัปดาห์ของ <span className="font-semibold text-text">{studentUsername}</span>
          </>
        )}
      </p>

      {error && (
        <p className="rounded-xl bg-red/10 p-3 text-center text-base text-red">{error}</p>
      )}

      {/* สถานะปัจจุบัน — ตัวใหญ่ อ่านง่าย เป็นสิ่งแรกที่เห็น ไม่มี %/เป้าเทียบตามสเปก
          ส่วนจำนวนข้อ (ถ้ามี) เป็นบรรทัดเล็กด้านล่าง แยกจากข้อความหลักชัดเจน */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold-dim bg-card px-6 py-8 text-center">
        {loading ? (
          <p className="text-lg text-text3">กำลังโหลด...</p>
        ) : !progress?.has_goal ? (
          <>
            <Feather className="h-10 w-10 text-text3" />
            <p className="text-xl font-bold text-text">ยังไม่ได้ตั้งเป้าสัปดาห์นี้</p>
            <p className="text-base text-text3">เลือกด้านล่างได้เลย ใช้เวลาไม่ถึงนาที</p>
          </>
        ) : (
          <>
            <div className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${visual?.ring ?? "border-gold-hi"}`}>
              <StatusIcon className={`h-8 w-8 ${visual?.text ?? "text-gold-hi"}`} />
            </div>
            <p className={`text-3xl font-extrabold ${visual?.text ?? "text-gold-hi"}`}>{progress.bucket}</p>
          </>
        )}

        {!loading && hasActivity && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-text3">
            <ListChecks className="h-4 w-4" />
            สัปดาห์นี้ตอบไปแล้ว {progress!.total_questions} ข้อ ถูก {progress!.total_correct} ข้อ
          </p>
        )}
      </div>

      {/* เลือก/เปลี่ยนเป้า — การ์ดใหญ่ ไม่ใช่ปุ่มเล็ก มีคำอธิบายภาษาพูดกำกับทุกตัวเลือก
          เผื่อผู้ปกครองที่อาจไม่คุ้นแอป/ตัวหนังสือเล็ก */}
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold text-text2">
          {progress?.has_goal ? "เปลี่ยนเป้าหมาย" : "ตั้งเป้าความสม่ำเสมอ"}
        </p>
        {(isSelf ? LEVELS_SELF : LEVELS).map(({ level, label, description }) => {
          const isSelected = progress?.goal_level === level;
          return (
            <button
              key={level}
              type="button"
              disabled={submitting}
              onClick={() => handleSetLevel(level, label)}
              className={`flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                isSelected
                  ? "border-gold-hi bg-gold-hi/10"
                  : "border-border bg-card hover:border-gold-dim"
              }`}
            >
              <div>
                <p className={`text-lg font-bold ${isSelected ? "text-gold-hi" : "text-text"}`}>{label}</p>
                <p className="mt-0.5 text-sm text-text3">{description}</p>
              </div>
              {isSelected && <Check className="h-6 w-6 flex-none text-gold-hi" />}
            </button>
          );
        })}
      </div>

      {justSetLabel && (
        <p className="text-center text-base text-text2">
          {isSelf ? (
            <>
              ตั้งเป้า <span className="font-semibold text-gold-hi">{justSetLabel}</span> เรียบร้อยแล้ว
            </>
          ) : (
            <>
              ตั้งเป้า <span className="font-semibold text-gold-hi">{justSetLabel}</span> ให้{" "}
              {studentUsername} เรียบร้อยแล้ว
            </>
          )}
        </p>
      )}
    </div>
  );
}
