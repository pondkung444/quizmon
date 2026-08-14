import { SkelBackLink, SkelBlock, SkelCircle } from "@/components/social/skeleton";

// S04 — โครงตามลำดับจริง: ชื่อ → Qmon ที่ภูมิใจ+radar → ปุ่มถูกใจ/เพิ่มเพื่อน → เหรียญ
export default function PublicProfileLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SkelBackLink />
      <SkelBlock className="h-6 w-32" />

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
    </main>
  );
}
