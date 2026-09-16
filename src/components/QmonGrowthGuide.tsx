import { STAGE_EXP_THRESHOLD } from "@/lib/evolution";

export default function QmonGrowthGuide({ stage, exp, dailyCap, advancedActivitiesUnlocked }: {
  stage: number;
  exp: number;
  dailyCap: number;
  advancedActivitiesUnlocked: boolean;
}) {
  const target = STAGE_EXP_THRESHOLD[3];
  const fullGrown = stage >= 4;

  return (
    <details aria-label="เส้นทางเติบโตของ Qmon" className="w-full text-left">
      <summary className="flex min-h-11 cursor-pointer items-center justify-center text-xs text-text3">ดูเส้นทางการเติบโต</summary>
      <div className="pb-2 text-left">
      <p className="text-xs leading-5 text-text2">
        {fullGrown
          ? "เก็บ Qmon ตัวนี้เข้าฟาร์มด้วยปุ่มด้านบน แล้วเลือกตัวนี้ไปท้าทายด่านหรือผจญภัยได้"
          : `ตัวนี้สะสม ${exp} EXP แล้ว${exp >= target ? " · ถึงเกณฑ์ EXP แล้ว ฝึกต่อเพื่อขยับระยะ" : ""}`}
      </p>
      {!fullGrown && <p className="mt-2 text-xs leading-5 text-text3">
        ทำภารกิจก่อน แล้วฝึกให้ครบ {dailyCap} EXP ต่อวัน พลังสะสมของ Qmon ไม่รีเซ็ตเมื่อขึ้นวันใหม่ และเติบโตทีละระยะ
      </p>}
        <ol className="mt-2 space-y-1 pl-5 text-xs leading-5 text-text3 list-decimal">
          <li>Stage 1 → 2: สะสม {STAGE_EXP_THRESHOLD[1]} EXP</li>
          <li>Stage 2 → 3: สะสม {STAGE_EXP_THRESHOLD[2]} EXP</li>
          <li>Stage 3 → 4: สะสม {target} EXP แล้วเก็บเข้าฟาร์ม</li>
        </ol>
        <p className="mt-3 text-xs leading-5 text-text2">
          {advancedActivitiesUnlocked
            ? "บัญชีนี้มีโหมดท้าทายและผจญภัยให้เล่นแล้ว เลือก Qmon Stage 4 จากฟาร์มในแต่ละโหมด"
            : "🔒 ท้าทายและผจญภัยรอ Qmon Stage 4 — ระหว่างนี้ทำภารกิจและฝึก Qmon ต่อได้ตามปกติ"}
        </p>
        <p className="mt-2 text-xs leading-5 text-text3">ท้าทายด่านใช้กุญแจ ส่วนผจญภัยเลือกเส้นทางและกลับมารับผลเมื่อเดินทางครบเวลา</p>
      </div>
    </details>
  );
}
