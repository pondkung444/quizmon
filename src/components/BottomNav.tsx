"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown, Users, Warehouse } from "lucide-react";

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
    href: "/hall-of-fame",
    label: "หอเกียรติยศ",
    icon: (active: boolean) => <Crown strokeWidth={active ? 2 : 1.5} />,
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname?.startsWith("/quiz") || pathname === "/login" || pathname === "/") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gold-dim bg-card">
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
              <span className="h-6 w-6">{tab.icon(!!active)}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
