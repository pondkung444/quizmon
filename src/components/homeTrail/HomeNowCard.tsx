"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import CollectPetButton from "@/components/CollectPetButton";
import type { EggChoice } from "@/components/EggChoiceModal";
import type { NextAction } from "@/lib/nextAction";
import { eggAnswersLeft } from "@/lib/homeTrail";
import { keepTogether } from "@/components/homeTrail/keepTogether";
import { useSfx } from "@/lib/audio/useSfx";
import { flush } from "@/lib/analytics";

// การ์ด "ตอนนี้" — ปุ่มเดียวของหน้า ข้อความทั้งหมดมาจาก resolveNextAction() (title/description/cta/meta)
// daily_mission = hard navigation เหมือน MissionCard.goToMission() · collect_evolution = flow ของ CollectPetButton
export default function HomeNowCard({
  action,
  avatar,
  say,
  mission,
  training,
  eggChoices,
  onCtaClick,
  slot,
  collectAnchor,
  egg,
  preview = false,
}: {
  action: NextAction;
  // น้อง (sprite/รูป) ในการ์ด — null เมื่อน้องอยู่ในฉากซ้าย (จอกว้าง)
  avatar: ReactNode | null;
  say: ReactNode | null;
  mission: { answeredCount: number; target: number } | null;
  training: { expToday: number; dailyCap: number } | null;
  eggChoices: EggChoice[];
  onCtaClick: () => void;
  // การ์ดถูก render หลายตำแหน่ง (ซ่อนด้วย CSS) — slot ทำให้ id ไม่ชนกัน
  slot: "top" | "inline" | "side";
  // id="collect-qmon" ใส่ได้ใบเดียว — ใบที่ตรงกับจอปัจจุบัน
  collectAnchor: boolean;
  // ระยะ 1: แสดงไข่ + "ตอบถูกอีก N ข้อ ไข่จะฟัก" + รอยร้าว 5 ช่อง แทนขีดความคืบหน้าปกติ
  egg: { exp: number } | null;
  // ?trailPreview= — ข้อมูลสมมติ ปุ่มไม่ทำงาน (กันกดเก็บเข้าฟาร์ม/เข้าภารกิจจริงจากสถานะปลอม)
  preview?: boolean;
}) {
  const sfx = useSfx();
  const arrow = <ChevronRight size={20} strokeWidth={3} aria-hidden />;

  let cta: ReactNode;
  if (preview) {
    cta = (
      <button type="button" className="ht-go" aria-disabled title="โหมดพรีวิว ปุ่มไม่ทำงาน">
        {action.cta}
        {arrow}
      </button>
    );
  } else if (action.id === "collect_evolution") {
    cta = (
      <CollectPetButton
        eggChoices={eggChoices}
        renderButton={(onCollect, isPending, errorMessage) => (
          <>
            <button
              type="button"
              className="ht-go"
              disabled={isPending}
              onClick={() => {
                onCtaClick();
                onCollect();
              }}
            >
              {isPending ? "กำลังเก็บ..." : action.cta}
              {arrow}
            </button>
            {errorMessage && <p className="ht-err">{errorMessage}</p>}
          </>
        )}
      />
    );
  } else if (action.id === "daily_mission") {
    cta = (
      <button
        type="button"
        className="ht-go"
        onClick={() => {
          sfx("tap");
          onCtaClick();
          // ส่ง home_next_action_clicked ที่ค้าง buffer ก่อนทิ้งหน้า (fetch keepalive รอดการเปลี่ยนหน้า)
          void flush();
          // hard navigation เหมือน MissionCard — router.push() เคยได้ /quiz จาก client cache เก่า (ไม่มี ?mission=)
          window.location.assign(action.href);
        }}
      >
        {action.cta}
        {arrow}
      </button>
    );
  } else {
    cta = (
      <Link href={action.href} className="ht-go" onClick={onCtaClick}>
        {action.cta}
        {arrow}
      </Link>
    );
  }

  return (
    <article
      className="ht-now"
      data-now-card={slot}
      id={collectAnchor && action.id === "collect_evolution" ? "collect-qmon" : undefined}
      aria-labelledby={`ht-now-title-${slot}`}
    >
      {say}
      <div className="ht-now-top">
        <div className="ht-q" data-trail-anchor="todo">
          {avatar}
        </div>
        <div>
          <p className="ht-k">ตอนนี้</p>
          <h3 id={`ht-now-title-${slot}`}>{action.title}</h3>
          <p className="ht-nd">{keepTogether(action.description)}</p>
          {egg ? (
            <>
              <div className="ht-pips" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} className={i < Math.floor(egg.exp / 10) ? "on" : ""} />
                ))}
              </div>
              <p className="ht-reward">ตอบถูกอีก <span className="whitespace-nowrap">{eggAnswersLeft(egg.exp)} ข้อ</span> ไข่จะฟัก</p>
              {mission && <p className="ht-reward">{keepTogether(action.meta)}</p>}
            </>
          ) : mission && (
            <>
              <div className="ht-pips" aria-hidden>
                {Array.from({ length: mission.target }, (_, i) => (
                  <i key={i} className={i < mission.answeredCount ? "on" : ""} />
                ))}
              </div>
              <p className="ht-reward">{keepTogether(action.meta)}</p>
            </>
          )}
          {!egg && training && (
            <div className="ht-meter" role="img" aria-label={action.meta}>
              <i style={{ width: `${Math.min(100, (training.expToday / Math.max(1, training.dailyCap)) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
      {cta}
    </article>
  );
}
