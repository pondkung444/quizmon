import { SkelBlock, SkelCircle, SkelRows, SkelSegmentedTabs } from "@/components/social/skeleton";

// S01/S02/S03 ใช้หน้าเดียวกัน (แท็บสลับด้วย client state) — ไม่รู้ว่าแท็บไหนกำลังจะโหลดจาก loading.tsx
// เอง (ไม่มี searchParams ให้ใช้) เลยออกแบบรูปร่างกลางๆ ที่ใช้ได้ทั้ง 3 แท็บ: แถบแท็บจริงขึ้นทันที
// (§12.2) ตามด้วยโครงการ์ดคู่ + รายการแถว
export default function SocialLoading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SkelSegmentedTabs labels={["อันดับ", "เพื่อน", "โปรไฟล์"]} />
      <div className="flex items-center gap-4 rounded-2xl border border-gold-dim bg-card p-4">
        <SkelCircle className="h-24 w-24" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkelBlock className="h-4 w-3/4" />
          <SkelBlock className="h-4 w-1/2" />
          <SkelBlock className="h-4 w-2/3" />
        </div>
      </div>
      <SkelRows count={5} />
    </div>
  );
}
