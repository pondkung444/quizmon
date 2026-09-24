"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { track } from "@/lib/analytics";
import { uxFunnelProps, type LearnerState } from "@/lib/analyticsContract";
import type { NextAction } from "@/lib/nextAction";

export default function HomeNextAction({
  action,
  learnerState,
  advancedActivitiesUnlocked = false,
}: {
  action: NextAction;
  learnerState: LearnerState;
  advancedActivitiesUnlocked?: boolean;
}) {
  useEffect(() => {
    track("home_next_action_viewed", uxFunnelProps(learnerState, { activity: action.activity, source: action.id }));
  }, [action.activity, action.id, learnerState]);

  function trackClick() {
    track("home_next_action_clicked", uxFunnelProps(learnerState, { activity: action.activity, source: action.id }));
  }

  return (
    // สีทั้งการ์ดมาจาก --hero-* (globals.css) — ธีมหน้า /pet ทำให้การ์ดนี้เป็นก้อนสีสดเด่นที่สุดของหน้า
    // ค่าเริ่มต้นใน :root คือหน้าตาเดิม (การ์ดเข้มขอบทอง ปุ่มส้ม)
    <section aria-labelledby="next-action-title" className="w-full rounded-3xl border border-(--hero-border) bg-(image:--hero-bg) p-5 text-left shadow-lg">
      <p className="text-xs font-bold tracking-wide text-(--hero-kicker)">🎯 ทำสิ่งนี้ต่อ</p>
      <h1 id="next-action-title" className="mt-1 text-xl font-bold text-(--hero-title)">{action.title}</h1>
      <p className="mt-2 text-sm leading-6 text-(--hero-text2)">{action.description}</p>
      <p className="mt-3 text-xs text-(--hero-text3)">{action.meta}</p>
      <Link href={action.href} onClick={trackClick} className="mt-4 flex min-h-11 w-full items-center justify-center rounded-2xl bg-(--hero-cta-bg) px-4 py-3 text-base font-bold text-(--hero-cta-text) shadow-[0_4px_0_var(--hero-cta-shadow)] transition active:translate-y-0.5 active:shadow-[0_2px_0_var(--hero-cta-shadow)]">
        {action.cta} ▶
      </Link>
      <details className="mt-3 border-t border-(--hero-divider) pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 text-sm font-medium text-(--hero-text2)">
          กิจกรรมอื่น <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <nav aria-label="กิจกรรมอื่น" className="grid grid-cols-2 gap-2 pt-2 text-center text-sm">
          <Link className="min-h-11 rounded-xl border border-(--hero-divider) p-3 text-(--hero-title)" href="/quiz">ฝึก Qmon</Link>
          {advancedActivitiesUnlocked ? (
            <>
              <Link className="min-h-11 rounded-xl border border-(--hero-divider) p-3 text-(--hero-title)" href="/adventure">ผจญภัย</Link>
              <Link className="min-h-11 rounded-xl border border-(--hero-divider) p-3 text-(--hero-title)" href="/raid">ท้าทายด่าน</Link>
            </>
          ) : (
            <div className="col-span-2 rounded-xl border border-(--hero-divider) bg-black/10 p-3 text-(--hero-text2)">
              🔒 ผจญภัยและท้าทายด่าน — ปลดล็อกเมื่อมี Qmon Stage 4
              <p className="mt-2 text-xs leading-5">ทำภารกิจก่อน แล้วฝึก Qmon ให้เต็มทุกวัน ดูเป้าหมาย EXP ในเส้นทางเติบโตด้านล่าง</p>
            </div>
          )}
          <Link className="min-h-11 rounded-xl border border-(--hero-divider) p-3 text-(--hero-title)" href="/pvp">ประลอง</Link>
        </nav>
        {advancedActivitiesUnlocked && <p className="mt-2 text-center text-xs leading-5 text-(--hero-text3)">ท้าทายใช้กุญแจ · ผจญภัยเลือกเส้นทางแล้วรอรับผล · อาหารใช้ป้อน Qmon ไม่ใช่ค่าฝึก</p>}
      </details>
    </section>
  );
}
