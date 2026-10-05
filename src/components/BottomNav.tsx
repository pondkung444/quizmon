"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Swords, Users, Warehouse } from "lucide-react";

const TABS = [
  {
    href: "/pet",
    label: "บ้าน",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
        <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20h3.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/social",
    label: "สังคม",
    icon: (active: boolean) => <Users strokeWidth={active ? 2 : 1.5} />,
  },
  {
    href: "/collection",
    label: "ฟาร์ม",
    icon: (active: boolean) => <Warehouse strokeWidth={active ? 2 : 1.5} />,
  },
  {
    href: "/pvp",
    label: "ประลอง",
    icon: (active: boolean) => <Swords strokeWidth={active ? 2 : 1.5} />,
  },
];

// ป้ายบนไอคอน — ใช้ร่วมกันทั้งแถบล่าง (มือถือ) และ rail ข้างกรอบ (≥ lg)
function TabIcon({
  tab,
  active,
  hasUnreadEncouragements,
  pvpBadgeCount,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  hasUnreadEncouragements: boolean;
  pvpBadgeCount: number;
}) {
  return (
    <span className="relative h-6 w-6">
      {tab.icon(active)}
      {/* จุดสีส้ม (§8.1) — มีข้อความกำลังใจใหม่ที่ยังไม่อ่าน หายไปหลังเปิด S08 (read_at ถูกเซ็ต) */}
      {tab.href === "/social" && hasUnreadEncouragements && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber" />
      )}
      {/* ตัวเลขแดง (สไลซ์ 5 §7) — ถึงตาเรา (รวม card_ready ที่ต้องกดเริ่มตอบ) + คำท้าที่รับเข้ามารอตอบรับ */}
      {tab.href === "/pvp" && pvpBadgeCount > 0 && (
        <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-red px-1 text-[9px] font-extrabold leading-none text-track">
          {pvpBadgeCount > 9 ? "9+" : pvpBadgeCount}
        </span>
      )}
    </span>
  );
}

// rail (≥ lg) ไม่ render บนจอครู/TV/โปรเจกเตอร์และพื้นที่ผู้ปกครอง — แถบล่างมือถือยังเป็นพฤติกรรมเดิม
const NO_RAIL_PREFIXES = ["/boss-raid", "/classroom", "/my-plan", "/guardian"];

export default function BottomNav({
  hasUnreadEncouragements = false,
  pvpBadgeCount = 0,
  forceShow = false,
}: {
  hasUnreadEncouragements?: boolean;
  // สไลซ์ 5 — ตัวเลขรวม: แมตช์ที่ถึงตาเรา + คำท้าที่รับเข้ามาแล้วยัง pending (src/lib/pvp.ts getPvpBadgeCount)
  pvpBadgeCount?: number;
  // forceShow: ข้ามการซ่อนบน /quiz — ใช้ตอน QuizClient เรนเดอร์เมนูล่างเองในหน้าเลือกวิชา/เลือกบท
  // (ก่อนเริ่มรอบ ต้องมีทางกลับหน้าอื่นตามกฎ UX) ส่วนระหว่างตอบโจทย์ยังซ่อนตามเดิม
  forceShow?: boolean;
}) {
  const pathname = usePathname();

  if (!forceShow && pathname?.startsWith("/quiz")) return null;
  if (pathname === "/login" || pathname === "/") return null;
  // จอครู (ฉายโปรเจกเตอร์) — เมนูของนักเรียนไม่เกี่ยว
  if (pathname?.startsWith("/teacher")) return null;
  // Team Battle (มือถือนักเรียน) — เต็มจอระหว่างเล่น ไม่มีเมนูล่าง
  if (pathname && /^\/classroom\/[^/]+\/battle(\/|$)/.test(pathname)) return null;
  if (pathname?.startsWith("/login") || pathname === "/guest" || pathname?.startsWith("/admin")) return null;
  // พื้นที่ผู้ปกครอง — ตัดสินฝั่ง client (root layout ไม่ re-render ตอน soft-nav จึงอ่าน x-pathname ไม่ได้)
  if (pathname?.startsWith("/guardian")) return null;

  const showRail = !NO_RAIL_PREFIXES.some((p) => pathname?.startsWith(p));

  return (
    <>
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-gold-dim bg-card ${showRail ? "lg:hidden" : ""}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-xl items-stretch justify-around">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                active ? "text-amber" : "text-text3"
              }`}
            >
              <TabIcon tab={tab} active={!!active} hasUnreadEncouragements={hasUnreadEncouragements} pvpBadgeCount={pvpBadgeCount} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
    {showRail && (
      <nav
        className="fixed top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1 rounded-2xl border border-gold-dim bg-card p-1.5 lg:flex"
        style={{ left: "calc(50% - var(--app-frame-w) / 2 - var(--app-rail-w) - var(--app-rail-gap))", width: "var(--app-rail-w)" }}
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-medium transition-colors ${
                active ? "bg-bg text-amber" : "text-text3"
              }`}
            >
              <TabIcon tab={tab} active={!!active} hasUnreadEncouragements={hasUnreadEncouragements} pvpBadgeCount={pvpBadgeCount} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    )}
    </>
  );
}
