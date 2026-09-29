import PetAvatarFrame from "@/components/social/PetAvatarFrame";
import { SUBJECT_LABEL_TH, type GuardianHub } from "@/lib/guardianHub";

function formatExamDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

// frame_definitions.id → tier ของ CSS .guardian-frame-{tier} (guardian_basic → basic)
function frameTier(frameId: string): string {
  return frameId.replace(/^guardian_/, "");
}

// ส่วนที่ 1 ของ §7.2 — เด็กเห็นตัวเลข (§5.7) goal null → ไม่ render อะไรเลย (§5.8 ไม่บอกว่าไม่ได้ตั้ง)
export function GuardianGoalPanel({ goal, reward }: Pick<GuardianHub, "goal" | "reward">) {
  if (!goal) return null;
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.total_points / goal.target) * 100)) : 0;
  const nextFrame = reward?.next_frame_id ?? null;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gold-dim bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text3">เป้าสัปดาห์นี้</p>
        <p className="mt-1 text-sm font-bold text-text">
          คะแนนสัปดาห์นี้ {goal.total_points} / {goal.target}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-track">
          <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
        </div>
        {goal.reached && <p className="mt-2 text-xs text-text2">ถึงเป้าแล้ว เล่นต่อได้ตามสบาย</p>}
      </div>
      {nextFrame && (
        <div className="flex flex-none flex-col items-center gap-1 text-center">
          <PetAvatarFrame tier={frameTier(nextFrame)} size={52}>
            <span className="block h-full w-full bg-bg" />
          </PetAvatarFrame>
          <p className="text-[10px] text-text3">รางวัลถัดไป</p>
          {reward?.weeks_to_next != null && (
            <p className="max-w-[88px] text-[10px] text-text2">อีก {reward.weeks_to_next} สัปดาห์ที่ถึงเป้า</p>
          )}
        </div>
      )}
    </div>
  );
}

// ส่วนที่ 2 ของ §7.2 — คิวลำดับบท ไม่ใช่ปฏิทิน (§5.3): ห้ามมี "ช้ากว่าแผน" / สัปดาห์เป้าหมาย
// ไม่มีลิงก์ไป /my-plan (เด็กไม่มี Premium จะเด้งไปหน้าซื้อ)
export function GuardianPlanPanel({
  plan,
  reviewPausedToday,
}: Pick<GuardianHub, "plan"> & { reviewPausedToday?: GuardianHub["review_paused_today"] }) {
  if (!plan || plan.subjects.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gold-dim bg-card p-4">
      <p className="text-xs text-text3">กำลังทบทวน</p>
      {reviewPausedToday === "chapter_passed" && (
        <p className="text-xs text-text2">วันนี้ผ่านบทแล้ว พรุ่งนี้ไปต่อบทถัดไป</p>
      )}
      {reviewPausedToday === "student_closed" && (
        <p className="text-xs text-text2">วันนี้พักโหมดทบทวนไว้ พรุ่งนี้กลับมาต่อ</p>
      )}
      {plan.subjects.map((s) => (
        <div key={s.subject} className="flex flex-col gap-0.5">
          <p className="text-xs font-bold text-gold-hi">{SUBJECT_LABEL_TH[s.subject] ?? s.subject}</p>
          {s.done ? (
            <p className="text-sm text-text">ทบทวนครบทุกบทแล้ว</p>
          ) : (
            <>
              {s.current_chapter && <p className="text-sm text-text">{s.current_chapter}</p>}
              <p className="text-xs text-text3">
                บทที่ {s.position} จาก {s.total}
              </p>
            </>
          )}
        </div>
      ))}
      {plan.framework === "exam_prep" && plan.exam_date && (
        <p className="text-xs text-text3">วันสอบ {formatExamDate(plan.exam_date)}</p>
      )}
    </div>
  );
}

// ส่วนที่ 4 ของ §7.2 — ข้อความคงที่ ตรวจกับ RPC ฝั่งผู้ปกครองแล้ว (ยอดรวมทั้งหมด ไม่มีรายข้อ)
// ห้ามแสดงเวลาที่ผู้พิทักษ์เปิดดู (§10.1)
export function GuardianVisibilityNote() {
  return (
    <details className="rounded-2xl border border-gold-dim bg-card p-4 text-sm">
      <summary className="cursor-pointer text-xs font-bold text-text3">สิ่งที่ผู้พิทักษ์เห็น</summary>
      <div className="mt-3 flex flex-col gap-2 text-text2">
        <p>
          <span className="font-bold text-text">ผู้พิทักษ์เห็น:</span> คะแนนและวันที่หนูเล่น ·
          จำนวนข้อที่ทำและตอบถูกในแต่ละวันแยกตามบท · บทที่ทำได้ดีและบทที่ยังต้องฝึก ·
          แผนทบทวนและเป้าหมาย · Qmon ของหนู
        </p>
        <p>
          <span className="font-bold text-text">ผู้พิทักษ์ไม่เห็น:</span> เพื่อนของหนู · การประลอง ·
          ข้อความที่คุยกับเพื่อน · คำตอบรายข้อ
        </p>
        <p>หนูถอดการเชื่อมได้เองทุกเมื่อ</p>
      </div>
    </details>
  );
}
