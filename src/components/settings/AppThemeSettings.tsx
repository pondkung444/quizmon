"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { APP_THEMES, APP_THEME_LABEL_TH, type AppTheme } from "@/lib/appTheme";
import { setAppTheme } from "@/app/settings/actions";

// ภาพตัวอย่างย่อของแต่ละธีม — ต้องโชว์สีของทั้งสองธีมพร้อมกันในหน้าเดียว จึงใส่สีจริงตรงนี้แทน token
// ให้ตรงกับ --pet-sky / --pet-ground / --hero-bg ใน globals.css [data-app-theme]
const PREVIEW: Record<AppTheme, { page: string; sky: string; ground: string; hero: string; note: string }> = {
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

export default function AppThemeSettings({ initial }: { initial: AppTheme }) {
  const [theme, setTheme] = useState<AppTheme>(initial);

  function choose(next: AppTheme) {
    setTheme(next);
    // หน้าตั้งค่าเองก็อยู่ในธีม — สลับป้าย AppThemeMarker ในหน้านี้ทันทีให้เห็นผลเลย (ป้ายเป็น span จาก
    // server ไม่มี state ของ React ผูกอยู่) แล้วค่อยเก็บ cookie ฝั่ง server ให้หน้าอื่นอ่านตอน render
    document.querySelector("[data-app-theme]")?.setAttribute("data-app-theme", next);
    void setAppTheme(next);
  }

  return (
    <section className="rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="mb-1 text-sm font-bold text-gold-hi">ธีมแอป</h2>
      <p className="mb-3 text-xs text-text3">เปลี่ยนโทนสีหน้าหลักของแอป (บ้าน สังคม ฟาร์ม ประลอง ตอบคำถาม ตั้งค่า ฯลฯ) ส่วนฉากผจญภัยและฉากต่อสู้ยังเป็นโทนเดิม</p>
      <div role="radiogroup" aria-label="ธีมแอป" className="grid grid-cols-2 gap-3">
        {APP_THEMES.map((t) => {
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
              <p className="mt-1.5 px-1 text-sm font-bold text-text">{APP_THEME_LABEL_TH[t]}</p>
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
