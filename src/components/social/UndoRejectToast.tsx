"use client";

// แค่ตัวโชว์ผล — ตัว setTimeout 5 วิ/clearTimeout จริงอยู่ที่ผู้เรียกใช้ (FriendRequestsView)
// เพราะต้องคุม state ลิสต์การ์ด (เอาออก/เอากลับ) ร่วมกับ timer ตัวเดียวกัน แยกกันไม่ได้
export default function UndoRejectToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-gold bg-card px-4 py-2 text-sm font-bold text-text shadow-lg">
        <span>{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="text-amber underline underline-offset-2 active:scale-95"
        >
          เลิกทำ
        </button>
      </div>
    </div>
  );
}
