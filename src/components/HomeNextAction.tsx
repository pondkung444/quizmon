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
    <section aria-labelledby="next-action-title" className="w-full rounded-3xl border border-gold bg-gradient-to-br from-card to-track p-5 text-left shadow-lg">
      <p className="text-xs font-bold tracking-wide text-amber">ทำสิ่งนี้ต่อ</p>
      <h1 id="next-action-title" className="mt-1 text-xl font-bold text-gold-hi">{action.title}</h1>
      <p className="mt-2 text-sm leading-6 text-text2">{action.description}</p>
      <p className="mt-3 text-xs text-text3">{action.meta}</p>
      <Link href={action.href} onClick={trackClick} className="mt-4 flex min-h-11 w-full items-center justify-center rounded-2xl bg-amber px-4 py-3 text-base font-bold text-track shadow-md transition active:scale-[0.98]">
        {action.cta}
      </Link>
      <details className="mt-3 border-t border-border pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 text-sm font-medium text-text2">
          กิจกรรมอื่น <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <nav aria-label="กิจกรรมอื่น" className="grid grid-cols-2 gap-2 pt-2 text-center text-sm">
          <Link className="min-h-11 rounded-xl border border-border p-3" href="/quiz">ฝึก Qmon</Link>
          {advancedActivitiesUnlocked ? (
            <>
              <Link className="min-h-11 rounded-xl border border-border p-3" href="/adventure">ผจญภัย</Link>
              <Link className="min-h-11 rounded-xl border border-border p-3" href="/raid">ท้าทายด่าน</Link>
            </>
          ) : (
            <div className="col-span-2 rounded-xl border border-border bg-track/50 p-3 text-text3">
              🔒 ผจญภัยและท้าทายด่าน — ปลดล็อกเมื่อมี Qmon Stage 4
            </div>
          )}
          <Link className="min-h-11 rounded-xl border border-border p-3" href="/pvp">ประลอง</Link>
        </nav>
      </details>
    </section>
  );
}
