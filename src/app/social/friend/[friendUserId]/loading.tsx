import { SkelBackLink, SkelBlock, SkelCircle } from "@/components/social/skeleton";

// S05 — โครงตามลำดับจริง: ข้อมูลผู้เล่น → Qmon ที่ภูมิใจ+radar+อุปกรณ์ → ปุ่มถูกใจ/ส่งกำลังใจ →
// เหรียญ → เส้นทางของฉัน (6 กล่อง) → Qmon ตัวโปรด (3 กล่อง)
export default function FriendProfileLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <div className="flex items-center justify-between">
        <SkelBackLink />
        <SkelBlock className="h-11 w-11 rounded-full" />
      </div>

      <div>
        <SkelBlock className="h-6 w-32" />
        <SkelBlock className="mt-2 h-3 w-24" />
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-gold-dim bg-card p-4">
        <SkelCircle className="h-24 w-24" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkelBlock className="h-4 w-3/4" />
          <SkelBlock className="h-32 w-full" />
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <SkelBlock className="h-11 w-28 rounded-xl" />
        <SkelBlock className="h-11 w-28 rounded-xl" />
      </div>

      <div className="flex justify-center gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkelBlock key={i} className="h-24 w-24 rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkelBlock key={i} className="h-16 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkelBlock key={i} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    </main>
  );
}
