// Guest (anonymous) ยังประลองไม่ได้ — backend RPC บล็อกไว้แล้ว ฝั่งนี้โชว์ empty-state เชิงบวก
// แทนการปล่อยให้เจอ error ดิบตอนกดท้า
export default function PvpGuestLocked() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-gold-hi">ประลอง</h1>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-gold-dim bg-card p-8 text-center">
        <span className="text-4xl">⚔️</span>
        <p className="text-base font-bold text-text">ประลองรอเธออยู่!</p>
        <p className="text-sm text-text2">
          ผูกไอดีก่อนนะ ถึงจะชวนเพื่อนมาประลองกันได้ — Qmon ของเธอจะถูกเก็บไว้ให้ครบทุกตัว
        </p>
        <p className="text-xs text-text3">
          พอ Qmon วิวัฒนาการครั้งแรก เกมจะชวนเธอผูกไอดีให้เอง
        </p>
      </div>
    </main>
  );
}
