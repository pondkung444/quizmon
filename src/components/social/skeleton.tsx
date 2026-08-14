// Skeleton primitives ตามรูปร่างเนื้อหาจริง (§12.2) — ใช้ร่วมกันในทุก loading.tsx ของฟีเจอร์
// Profile+Friends แทน spinner กลางจอ ไม่มี interactivity ใดๆ (server component เปล่าๆ พอ)
export function SkelBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gold-dim/20 ${className}`} />;
}

export function SkelCircle({ className = "" }: { className?: string }) {
  return <div className={`flex-none animate-pulse rounded-full bg-gold-dim/20 ${className}`} />;
}

// แถวรูปวงกลม + ข้อความ 1-2 บรรทัด — รูปร่างที่ใช้ซ้ำบ่อยที่สุด (แถวเพื่อน/คำขอ/อันดับ/กำลังใจ)
export function SkelRow() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gold-dim bg-card p-3">
      <SkelCircle className="h-12 w-12" />
      <div className="flex-1 space-y-2">
        <SkelBlock className="h-3 w-2/5" />
        <SkelBlock className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function SkelRows({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkelRow key={i} />
      ))}
    </div>
  );
}

// เลียนแบบ SegmentedTabs.tsx เป๊ะ (label จริงล้วนๆ ไม่ pulse) ให้หัวข้อแท็บ "ขึ้นทันทีไม่รอข้อมูล"
// ตาม §12.2 แม้เนื้อหาข้างใต้ยังเป็น skeleton อยู่
export function SkelSegmentedTabs({ labels }: { labels: string[] }) {
  return (
    <div className="sticky top-0 z-30 flex gap-1 rounded-xl border border-gold-dim bg-card p-1.5 shadow-md">
      {labels.map((label) => (
        <div
          key={label}
          className="flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm font-bold text-text3"
        >
          {label}
        </div>
      ))}
    </div>
  );
}

export function SkelBackLink() {
  return <SkelBlock className="h-5 w-16" />;
}
