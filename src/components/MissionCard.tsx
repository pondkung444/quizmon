"use client";

import { useRouter } from "next/navigation";
import type { TodayMissionResult } from "@/lib/missions";
import type { Subline } from "@/lib/evolution";
import { SUBJECT_LABEL } from "@/lib/labels";

// ข้อความ Qmon — personalized อิงจาก subline ของสัตว์ (ธีมบุคลิก ไม่ใช่วิชาของภารกิจเอง) ตาม
// design doc Phase 4 exploration ใช้ frame ชวนผจญภัยแยกต่างหาก ไม่ขึ้นกับ subline — โชว์เหมือนกัน
// ทั้งสถานะ "ยังไม่เริ่ม" และ "ค้างอยู่" (ไม่ได้ซ่อนตอนเริ่มทำแล้วเหมือนดราฟต์แรก)
function getStartMessage(mission: TodayMissionResult["mission"], subline: Subline | null): string {
  if (mission.mission_type === "exploration") {
    const subjectLabel = SUBJECT_LABEL[mission.subject] ?? mission.subject;
    return `เรายังไม่เคยไปสำรวจดินแดน${subjectLabel}เลยนะ ไปลองกัน 5 ข้อ`;
  }
  if (!subline) return "วันนี้มาฝึกเรื่องนี้กันเถอะ";
  if (subline === "math") return "ข้อมูลบอกว่าเรื่องนี้ยังพัฒนาได้อีก ลอง 5 ข้อกัน";
  if (subline === "science") return "ข้าพบเรื่องที่น่าทดลองเพิ่มแล้ว ไปสำรวจกันเถอะ";
  return "วันนี้ค่อยๆ ฝึกเรื่องนี้สัก 5 ข้อก็พอนะ"; // balanced
}

// การ์ดนี้เป็น "ครึ่งบน" ของบล็อกแอ็กชันรวม (ดู PetCard.tsx ส่วน 5.5/6) — เมื่อภารกิจยังไม่จบ
// (state 1/2) มันคือ CTA หลักของหน้าเลย แทนที่ปุ่ม "ฝึก Qmon" ไปเต็มๆ ไม่ใช่การ์ดเสริมอีกก้อน
// เมื่อภารกิจจบแล้ว (state 3) ยุบเหลือ chip บรรทัดเดียว ไม่แย่งพื้นที่จาก CTA "ฝึก Qmon" ที่กลับมา
// เป็นหลักตามเดิม (เรนเดอร์อยู่ใน PetCard.tsx) — null เมื่อไม่มี state ให้แสดงเลย (mission === null)
export default function MissionCard({
  mission,
  subline,
}: {
  mission: TodayMissionResult | null;
  subline: Subline | null;
}) {
  const router = useRouter();

  // null เมื่อยังไม่มี user/pet หรือ getOrCreateTodayMission พังกลางทาง (ดู pet/page.tsx —
  // จับ error ไว้ไม่ให้ทั้งหน้าพัง) ไม่แสดงอะไรเลยดีกว่าแสดงข้อมูลผิด — หน้าตกลงไปเป็นเหมือนก่อนมี
  // ระบบภารกิจเป๊ะ (ปุ่ม "ฝึก Qmon" เดี่ยวจาก PetCard.tsx)
  if (!mission) return null;

  const { mission: m, answeredCount, correctCount } = mission;
  const target = m.target_count;
  const done = answeredCount >= target;

  if (done) {
    // state 3: chip บรรทัดเดียว ไม่มีปุ่ม ไม่มีข้อความ Qmon หลายบรรทัด — จบแล้วไม่ควรกินที่
    // เท่าสถานะที่ยังรอแอ็กชันจากผู้เล่น
    return (
      <div className="w-full max-w-xs rounded-xl border border-gold-dim bg-card px-4 py-2 text-center">
        <p className="text-sm font-medium text-gold-hi">
          ✓ ภารกิจวันนี้สำเร็จ · ถูก {correctCount}/{target}
        </p>
      </div>
    );
  }

  const started = answeredCount > 0;

  function goToMission() {
    // router.push() เดี่ยวเท่านั้น ห้ามคู่กับ router.refresh() (บั๊ก Next.js canary build นี้)
    router.push(`/quiz?mission=${m.id}`);
  }

  function goToPractice() {
    router.push("/quiz");
  }

  return (
    <div className="w-full max-w-xs rounded-2xl border border-gold-dim bg-card p-3 text-center">
      <p className="text-sm font-bold text-gold-hi">{m.category}</p>

      {m.mission_type === "personalized" && m.baseline_accuracy !== null && (
        <p className="mt-0.5 text-xs text-text3">ช่วง 7 วันที่ผ่านมา คุณตอบถูก {m.baseline_accuracy}%</p>
      )}

      <p className="mt-1 text-xs text-text3">{getStartMessage(m, subline)}</p>

      <button
        type="button"
        onClick={goToMission}
        className="mt-2 w-full rounded-2xl border border-gold bg-amber py-2.5 text-lg font-bold text-track shadow-lg transition active:scale-95"
      >
        {started ? `ฝึกต่อ (${answeredCount}/${target})` : "เริ่มภารกิจ"}
      </button>

      {/* หลัก "แนะนำแต่ไม่บังคับ" — โหมดฝึกปกติต้องเข้าถึงได้เสมอแม้มีภารกิจค้างอยู่ */}
      <button
        type="button"
        onClick={goToPractice}
        className="mt-1.5 text-xs text-text3 underline underline-offset-2"
      >
        หรือเลือกฝึกบทอื่นเอง
      </button>
    </div>
  );
}
