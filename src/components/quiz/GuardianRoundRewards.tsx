import PetAvatarFrame from "@/components/social/PetAvatarFrame";
import type { RoundFinishResult } from "@/app/quiz/actions";

// การ์ดแจ้งเมื่อจบรอบ (เฟส 2): ผ่านบทของแผนผู้พิทักษ์ / ได้ไข่ศักดิ์ธรา / ได้กรอบโปรไฟล์ — แสดงเฉพาะเมื่อมีอะไรให้แจ้ง
// โทนบวกเท่านั้น ไม่มีสีแดง แถว 'stuck' ไม่ถูกส่งมาที่นี่ (บอกผู้ปกครองเท่านั้น §5.5)
// ไข่ใช้การ์ดนี้ ไม่ใช้ eggToastMessage เดิม (กันชนกับข้อความไข่พรีเมียม premiumBiweeklyEgg)
export default function GuardianRoundRewards({
  summary,
}: {
  summary: Pick<RoundFinishResult, "planPassed" | "planEggAwarded" | "goalFrameAwarded">;
}) {
  const { planPassed, planEggAwarded, goalFrameAwarded } = summary;
  if (planPassed.length === 0 && !planEggAwarded && !goalFrameAwarded) return null;

  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-gold-dim bg-card p-5 text-center">
      {planPassed.length > 0 && (
        <div className="flex flex-col gap-1">
          {planPassed.map((p) => (
            <p key={p.chapterName} className="text-base font-bold text-gold-hi">
              ผ่านบท {p.chapterName} แล้ว 🎉
            </p>
          ))}
          <p className="text-sm text-text2">วันนี้เล่นอิสระได้เลย พรุ่งนี้ไปต่อบทถัดไป</p>
        </div>
      )}

      {planEggAwarded && <p className="text-base font-bold text-gold-hi">ได้ไข่ศักดิ์ธรา 🥚</p>}

      {goalFrameAwarded && (
        <div className="flex flex-col items-center gap-1">
          <PetAvatarFrame tier={goalFrameAwarded.replace(/^guardian_/, "")} size={56}>
            <span className="block h-full w-full bg-bg" />
          </PetAvatarFrame>
          <p className="text-base font-bold text-gold-hi">ได้กรอบโปรไฟล์ใหม่ ✨</p>
          <p className="text-sm text-text2">ไปเลือกใส่ได้ที่แท็บสังคม → โปรไฟล์</p>
        </div>
      )}
    </div>
  );
}
