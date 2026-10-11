"use client";
import { useState } from "react";
import { updateFarmNotifications } from "@/app/settings/farm-notifications";
export default function FarmNotificationSettings({
  initial,
  masterEnabled,
}: {
  initial: boolean;
  masterEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="font-bold">แจ้งเตือนฟาร์ม</h2>
      <p className="my-2 text-sm text-text2">
        รวมงานที่ต้องช่วย สถานที่พร้อมวาง และกำลังใจใหม่ ไม่เกินวันละ 1 ครั้ง
        และเว้นช่วงพักกลางคืน
      </p>
      <p className="mb-2 text-xs text-text3">
        รับผ่านแอปบนอุปกรณ์ที่อนุญาตแจ้งเตือน ต้องเปิดการแจ้งเตือนหลักด้วย
        จุดบนเมนูฟาร์มยังแสดงในเว็บได้
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await updateFarmNotifications(!enabled);
            setEnabled(!enabled);
          } catch {
            setError("บันทึกไม่สำเร็จ ลองอีกครั้ง");
          } finally {
            setBusy(false);
          }
        }}
        className="min-h-11 rounded-xl border border-gold-dim px-4"
      >
        {enabled ? "เปิดอยู่" : "ปิดอยู่"}
      </button>
      {!masterEnabled && (
        <p className="mt-2 text-xs">
          การแจ้งเตือนหลักปิดอยู่ จึงยังไม่ส่งแจ้งเตือนฟาร์ม
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
