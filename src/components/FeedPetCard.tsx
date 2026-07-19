"use client";

import { useState } from "react";
import Image from "next/image";
import { feedPet } from "@/app/pet/actions";
import { FOOD_LABEL, FOOD_IMAGE_PATH } from "@/lib/labels";

// ป้อนอาหาร A/B สะสมให้ Qmon ที่กำลังเลี้ยง — เฉพาะก่อน stage 4 (parent เป็นคนกันเงื่อนไข stage
// ไม่เรนเดอร์การ์ดนี้เลยตอน stage 4 ดู PetCard.tsx) อัปเดตจำนวนคงเหลือจาก response ตรงๆ ไม่ต้อง
// router.refresh() (ห้าม push+refresh พร้อมกันในหน้านี้ — ดูคอมเมนต์ใน MissionCard.tsx/AGENTS.md)
//
// ⚠️ จุดนี้ (คลัง/เลือก/ป้อนอาหาร) ต้องโชว์ชื่ออาหาร (FOOD_LABEL: ผลึกพลัง/ผลออโรร่า) เท่านั้น
// ห้ามโชว์ชื่อบุคลิก (ดุดัน/สุขุม) — ผู้เล่นยังไม่รู้ผลบุคลิกตอนนี้ ชื่อบุคลิกโชว์เฉพาะตอนเผยผล
// วิวัฒนาการสำเร็จใน PersonalityDecisionModal เท่านั้น
export default function FeedPetCard({
  petId,
  initialFoodA,
  initialFoodB,
}: {
  petId: string;
  initialFoodA: number;
  initialFoodB: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [foodA, setFoodA] = useState(initialFoodA);
  const [foodB, setFoodB] = useState(initialFoodB);
  const [selected, setSelected] = useState<"A" | "B" | null>(null);
  const [feeding, setFeeding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const quantities: Record<"A" | "B", number> = { A: foodA, B: foodB };

  function openSheet() {
    setSelected(null);
    setErrorMessage(null);
    setSheetOpen(true);
  }

  async function handleConfirm() {
    if (!selected || feeding || quantities[selected] <= 0) return;
    setFeeding(true);
    setErrorMessage(null);
    try {
      const { quantityRemaining } = await feedPet(petId, selected);
      if (selected === "A") setFoodA(quantityRemaining);
      else setFoodB(quantityRemaining);
      setSelected(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ป้อนอาหารไม่สำเร็จ");
    } finally {
      setFeeding(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="w-full max-w-xs rounded-2xl border border-gold-dim bg-card px-4 py-3 text-sm font-bold text-gold-hi transition active:scale-95"
      >
        🍽️ ป้อนอาหาร Qmon
      </button>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-gold-dim bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <h2 className="mb-1 text-sm font-bold text-gold-hi">เลือกอาหารให้ Qmon</h2>
            <p className="mb-4 text-xs text-text3">อาหารที่ป้อนจะสะสมไว้ตัดสินบุคลิกตอน Qmon โตเต็มที่</p>

            <div className="grid grid-cols-2 gap-3">
              {(["A", "B"] as const).map((foodType) => {
                const qty = quantities[foodType];
                const isSelected = selected === foodType;
                return (
                  <button
                    key={foodType}
                    type="button"
                    disabled={qty <= 0 || feeding}
                    onClick={() => setSelected(foodType)}
                    className="flex appearance-none flex-col items-center gap-2 bg-transparent transition active:scale-95 disabled:opacity-40"
                  >
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      {isSelected && (
                        <span className="absolute h-16 w-16 rounded-full bg-amber opacity-30 blur-xl" />
                      )}
                      {/* unoptimized: Next's built-in image optimizer flattens this PNG's alpha channel to
                          opaque white when it re-encodes to WebP/AVIF at small sizes (verified: raw file +
                          direct /_next/image PNG fetch are both properly transparent; the WebP output it
                          serves to real <img> Accept headers is not) — serve the raw file as-is instead */}
                      <Image
                        src={FOOD_IMAGE_PATH[foodType]}
                        alt={FOOD_LABEL[foodType]}
                        width={64}
                        height={64}
                        unoptimized
                        className="relative h-16 w-16 object-contain"
                      />
                    </div>
                    <span className={`text-sm font-bold ${isSelected ? "text-gold-hi" : "text-text"}`}>
                      {FOOD_LABEL[foodType]}
                    </span>
                    <span className="text-xs text-text3">มี {qty} ชิ้น</span>
                  </button>
                );
              })}
            </div>

            {errorMessage && <p className="mt-3 text-xs text-red">{errorMessage}</p>}

            <button
              type="button"
              disabled={!selected || feeding}
              onClick={handleConfirm}
              className="mt-4 w-full rounded-2xl border border-gold bg-amber py-3 text-sm font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              {feeding ? "กำลังป้อน..." : "ยืนยันป้อนอาหาร"}
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-2 w-full rounded-2xl border border-border py-3 text-sm font-bold text-text2"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </>
  );
}
