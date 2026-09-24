"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PET_THEMES, PET_THEME_LABEL_TH, type PetTheme } from "@/lib/petTheme";
import { setPetTheme } from "@/app/settings/actions";

// ภาพตัวอย่างย่อของแต่ละธีม — หน้า /settings ไม่ได้อยู่ในธีม /pet (token เป็นโทนเดิม) จึงต้องใส่สีจริงตรงนี้
// ให้ตรงกับ --pet-sky / --pet-ground / --hero-bg ใน globals.css [data-pet-theme]
const PREVIEW: Record<PetTheme, { page: string; sky: string; ground: string; hero: string; note: string }> = {
  dusk: {
    page: "#1a1f45",
    sky: "linear-gradient(180deg, #3b2a7a 0%, #6a3fa0 55%, #e0729a 100%)",
    ground: "#2a2366",
    hero: "linear-gradient(135deg, #ff9f43, #ff6b8b)",
    note: "โทนมืด ม่วงชมพู",
  },
  day: {
    page: "#fdf8ee",
    sky: "linear-gradient(180deg, #8fd3ff 0%, #c9ecff 60%, #fff6d6 100%)",
    ground: "#8ed36b",
    hero: "linear-gradient(135deg, #ffb238, #ff7a3d)",
    note: "โทนสว่าง ฟ้าใส",
  },
};

export default function PetThemeSettings({ initial }: { initial: PetTheme }) {
  const [theme, setTheme] = useState<PetTheme>(initial);

  function choose(next: PetTheme) {
    setTheme(next);
    // เปลี่ยนภาพตัวอย่างทันที แล้วค่อยเก็บ cookie ฝั่ง server (หน้า /pet อ่านตอน render)
    void setPetTheme(next);
  }

  return (
    <section className="rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="mb-1 text-sm font-bold text-gold-hi">ธีมหน้าน้อง Qmon</h2>
      <p className="mb-3 text-xs text-text3">เปลี่ยนโทนสีของหน้าบ้าน (หน้าน้อง Qmon) หน้าอื่นยังเป็นโทนเดิม</p>
      <div role="radiogroup" aria-label="ธีมหน้าน้อง Qmon" className="grid grid-cols-2 gap-3">
        {PET_THEMES.map((t) => {
          const selected = theme === t;
          const p = PREVIEW[t];
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(t)}
              className={`relative rounded-2xl border-2 p-1.5 text-left transition active:scale-95 ${
                selected ? "border-amber" : "border-border"
              }`}
            >
              <div className="overflow-hidden rounded-xl p-1.5" style={{ background: p.page }}>
                <div className="relative h-14 overflow-hidden rounded-lg" style={{ background: p.sky }}>
                  <span
                    className="absolute -bottom-5 -left-2 -right-2 h-9 rounded-[50%]"
                    style={{ background: p.ground }}
                  />
                </div>
                <div className="mt-1.5 h-4 rounded-md" style={{ background: p.hero }} />
              </div>
              <p className="mt-1.5 px-1 text-sm font-bold text-text">{PET_THEME_LABEL_TH[t]}</p>
              <p className="px-1 text-[11px] text-text3">{p.note}</p>
              {selected && (
                <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-on-amber">
                  <Check size={13} strokeWidth={3} aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
