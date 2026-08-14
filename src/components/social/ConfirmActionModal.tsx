"use client";

// Centered confirm/cancel modal — pattern เดียวกับ EggChoiceModal.tsx (ไม่ใช่ Bottom Sheet เพราะเป็น
// แค่ยืนยัน/ยกเลิก 2 ตัวเลือก ไม่ใช่งานเลือกจากลิสต์) ใช้ซ้ำได้ทั้งลบเพื่อนและบล็อก
export default function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  isPending,
  errorMessage,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  isPending: boolean;
  errorMessage: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-6">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gold-hi">{title}</h2>
          <p className="mt-1 text-sm text-text3">{description}</p>
        </div>

        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-gold-dim py-3 text-sm font-bold text-text3 transition active:scale-95 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className={`flex-1 rounded-2xl border py-3 text-sm font-bold shadow-lg transition active:scale-95 disabled:opacity-50 ${
              danger ? "border-red bg-red text-text" : "border-gold bg-amber text-track"
            }`}
          >
            {isPending ? "กำลังดำเนินการ..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
