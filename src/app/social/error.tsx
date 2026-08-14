"use client";

// error.tsx ครอบคลุมทุก route ใต้ /social (S02-S08 รวม S04/S05) — ก่อนหน้านี้ไม่มี boundary เลย
// ถ้า getPublicProfile/getFriendProfile หรือ query อื่นๆ throw (เช่น เน็ตหลุดระหว่างโหลดหน้า) ผู้เล่น
// จะเจอหน้า error ดิบของ Next.js แทนข้อความที่บอกทางแก้ (§12.3) — สีแดงใช้ได้ตรงนี้เพราะเป็น error จริง
export default function SocialError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 pb-24 text-center">
      <p className="text-sm text-red">เปิดหน้านี้ไม่สำเร็จ ลองใหม่อีกครั้ง</p>
      <button
        type="button"
        onClick={() => reset()}
        className="flex min-h-11 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95"
      >
        ลองอีกครั้ง
      </button>
    </main>
  );
}
