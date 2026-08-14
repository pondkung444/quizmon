import { Calendar, HelpCircle, Egg, Search, Flag, Trophy } from "lucide-react";
import type { ProfileJourneyStats } from "@/lib/profileJourneyStats";

// extract จาก MyProfileTab.tsx (S03) ตอนเฟส 6 — S05 (โปรไฟล์เพื่อน) ต้องโชว์ "เส้นทางของฉัน" แบบ
// เดียวกันเป๊ะ ใช้ component เดียวกันแทนก็อปโค้ด กันหน้าตาเพี้ยนกันระหว่างสองที่
function JourneyStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gold-dim bg-card p-3">
      <Icon className="h-5 w-5 shrink-0 text-amber" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-gold-hi">{value}</p>
        <p className="truncate text-[11px] text-text3">{label}</p>
      </div>
    </div>
  );
}

export default function JourneyStatsGrid({ stats }: { stats: ProfileJourneyStats }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <JourneyStat icon={Calendar} label="วันฝึกสะสม" value={`${stats.trainingDays} วัน`} />
      <JourneyStat icon={HelpCircle} label="คำถามที่ตอบ" value={`${stats.questionsAnswered} ข้อ`} />
      <JourneyStat icon={Egg} label="Qmon โตเต็มที่" value={`${stats.stage4PetCount} ตัว`} />
      <JourneyStat icon={Search} label="รูปแบบที่ค้นพบ" value={`${stats.uniqueEvolutionPatterns} แบบ`} />
      <JourneyStat icon={Flag} label="Challenge สูงสุด" value={stats.topChallengeCleared ?? "ยังไม่พิชิต"} />
      <JourneyStat icon={Trophy} label="แชมป์ Leaderboard" value={`${stats.weeklyChampionCount} ครั้ง`} />
    </div>
  );
}
