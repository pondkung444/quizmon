"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { track } from "@/lib/analytics";

export type CollectionSlot = {
  key: string;
  imagePath: string;
  speciesName: string;
  unlocked: boolean;
  petId: string | null;
  base: string;
  name: string;
  eggTypeId: string;
  subline: string;
  personality: string;
};

export type CollectionSection = {
  eggTypeId: string;
  eggNameTh: string;
  slots: CollectionSlot[];
};

// แยกเป็น client component เพราะช่อง silhouette ที่ยังไม่ปลดล็อกต้องกดเปิด popup ได้
// (พันธุ์+ชื่อเท่านั้น ไม่มี hint/ตัวเลข stat ใดๆ) ส่วนช่องที่ปลดล็อกแล้วลิงก์ตรงไป
// /collection/[petId] ของ "ตัวแรกที่เก็บ" ในคอมโบนั้น (คำนวณจากฝั่ง server แล้ว)
function trackSlotClick(slot: CollectionSlot) {
  track("collection_slot_click", {
    egg_type_id: slot.eggTypeId,
    subline: slot.subline,
    personality: slot.personality,
    is_filled: slot.unlocked,
  });
}

export default function CollectionGrid({ sections }: { sections: CollectionSection[] }) {
  const [previewSlot, setPreviewSlot] = useState<CollectionSlot | null>(null);

  useEffect(() => {
    track("collection_open");
  }, []);

  return (
    <>
      {sections.map((section) => (
        <section key={section.eggTypeId} className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-gold-hi">{section.eggNameTh}</h2>
          <div className="grid grid-cols-3 gap-3">
            {section.slots.map((slot, index) => {
              const card = (
                <div
                  className={`relative flex aspect-[1/1.08] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl p-2 transition active:scale-95 ${
                    slot.unlocked
                      ? "border border-gold bg-track"
                      : "border border-dashed border-border bg-card"
                  }`}
                >
                  {slot.unlocked ? (
                    <Image
                      src={slot.imagePath}
                      alt={slot.speciesName}
                      width={90}
                      height={90}
                      className="h-16 w-16 animate-card-bob object-contain"
                      style={{ animationDelay: `${(index % 6) * 180}ms` }}
                    />
                  ) : (
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      <div
                        className="h-full w-full bg-gold-dim"
                        style={{
                          maskImage: `url(${slot.imagePath})`,
                          WebkitMaskImage: `url(${slot.imagePath})`,
                          maskSize: "contain",
                          WebkitMaskSize: "contain",
                          maskRepeat: "no-repeat",
                          WebkitMaskRepeat: "no-repeat",
                          maskPosition: "center",
                          WebkitMaskPosition: "center",
                        }}
                      />
                      <span className="absolute text-lg font-bold text-text3">?</span>
                    </div>
                  )}
                  <p className="text-[10px] text-text3">{slot.unlocked ? slot.speciesName : "???"}</p>
                </div>
              );

              if (slot.unlocked && slot.petId) {
                return (
                  <Link key={slot.key} href={`/collection/${slot.petId}`} onClick={() => trackSlotClick(slot)}>
                    {card}
                  </Link>
                );
              }

              if (!slot.unlocked) {
                return (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => {
                      trackSlotClick(slot);
                      setPreviewSlot(slot);
                    }}
                  >
                    {card}
                  </button>
                );
              }

              return <div key={slot.key}>{card}</div>;
            })}
          </div>
        </section>
      ))}

      {previewSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setPreviewSlot(null)}
        >
          <div
            className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-gold-dim bg-card p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div
                className="h-full w-full bg-gold-dim"
                style={{
                  maskImage: `url(${previewSlot.imagePath})`,
                  WebkitMaskImage: `url(${previewSlot.imagePath})`,
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                }}
              />
            </div>
            <div>
              <p className="text-xs text-text3">พันธุ์: {previewSlot.base}</p>
              <p className="text-sm font-bold text-gold-hi">ชื่อ: {previewSlot.name}</p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewSlot(null)}
              className="w-full rounded-2xl border border-gold-dim bg-track py-2 text-sm font-medium text-text2 transition active:scale-95"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </>
  );
}
