"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Bottom sheet pattern แรกของโปรเจกต์ (§10.1) — component เดิมทั้งหมด (EggChoiceModal ฯลฯ) เป็น
// centered modal ไม่ใช่ bottom sheet ห้ามเอาไปปนกับของเดิม ใช้ CSS transition ล้วน ไม่ผูก library เพิ่ม
export default function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      <div
        className={`relative flex max-h-[85vh] w-full max-w-xl flex-col rounded-t-3xl border-t border-gold-dim bg-card transition-transform duration-200 ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-bold text-gold-hi">{title}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="ปิด"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-text3 transition active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
