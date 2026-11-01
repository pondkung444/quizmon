"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import {
  buildStarStates,
  constellationPoints,
  eggCracksBefore,
  EGG_HATCH_ANSWERS,
  stageGrowth,
  STARDUST_TEXT,
  type StardustElement,
} from "@/lib/stardust";
import { ElementGradient, STAR_PATH } from "@/components/quiz/stardust/StarShape";
import ShareMomentButton from "@/components/quiz/stardust/ShareMomentButton";
import type { GradeBand } from "@/lib/gradeBand";
import type { ShareCardInput } from "@/lib/share/renderShareCard";

const T = STARDUST_TEXT.end;

// จบรอบ (แทนหน้าสรุปทั้งโหมดฝึกและภารกิจเมื่อเปิด flag) — ตัวเลขทุกตัวมาจาก state เดิมของ QuizClient
// (finalExpEarned / summary / missionClaim) ไม่คำนวณ EXP เอง · ส่วนที่คงของเดิมส่งเข้ามาเป็น slot
export default function StardustEnd({
  element,
  isEgg,
  img,
  name,
  stage,
  expBefore,
  results,
  total,
  priorCount,
  correctCount,
  starsLit,
  gainExp,
  expAddedToPet,
  evolved,
  toStage,
  capped,
  missionBonusExp,
  farmCoins,
  saveWarning,
  missionClaimFailed,
  missedCount,
  onReview,
  onPlayAgain,
  onBack,
  onGoHatch,
  gradeBand,
  shareCard,
  speech,
  rewards,
  overlays,
}: {
  element: StardustElement;
  isEgg: boolean;
  img: string | null;
  name: string;
  stage: number;
  expBefore: number;
  results: boolean[];
  total: number;
  priorCount: number;
  // ตอบถูกทั้งภารกิจ (DB: missionClaim.correctCount) / ทั้งรอบ (โหมดฝึก) — ใช้ในบรรทัด "ตอบถูก N จาก M"
  correctCount: number;
  // ดาวที่เก็บได้ "ในรอบนี้" เท่านั้น (ไม่นับข้อภารกิจที่ทำก่อนรอบ) — ใช้ในหัวข้อ
  starsLit: number;
  gainExp: number;
  // null = ยังไม่มีผลจาก finishQuizRound (เช่นภารกิจที่ครบตั้งแต่ก่อนเปิดหน้า) → ใช้ gainExp แทนเพื่อแสดงแถบ
  expAddedToPet: number | null;
  evolved: boolean;
  toStage: number | null;
  capped: boolean;
  missionBonusExp: number | null;
  farmCoins: number | null;
  saveWarning: string | null;
  missionClaimFailed: boolean;
  missedCount: number;
  onReview: (() => void) | null;
  onPlayAgain: (() => void) | null;
  onBack: () => void;
  onGoHatch: () => void;
  gradeBand?: GradeBand;
  // null = ไม่มี moment ให้แชร์ หรือ flag SHARE_CARDS_ENABLED ปิด
  shareCard?: ShareCardInput | null;
  speech?: ReactNode;
  rewards?: ReactNode;
  overlays?: ReactNode;
}) {
  const gradientId = `sd-grad-${useId().replace(/:/g, "")}`;
  const [imgFailed, setImgFailed] = useState(false);
  const [filled, setFilled] = useState(false);
  const n = Math.max(1, total);
  const points = constellationPoints(element, n);
  const { stars, links } = buildStarStates(results, n, -1, priorCount);
  const added = (expAddedToPet ?? gainExp) + (missionBonusExp ?? 0);
  const growth = stageGrowth(stage, expBefore, added);
  const cracks = isEgg ? Math.min(EGG_HATCH_ANSWERS, eggCracksBefore(expBefore + added)) : 0;
  const hatchReady = isEgg && (evolved || cracks >= EGG_HATCH_ANSWERS);

  // แถบ EXP เติมหลังดาวเด้งครบ (~900ms) · reduced motion → CSS ตัด transition ให้ไปค่าสุดท้ายทันที
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 900);
    return () => clearTimeout(t);
  }, []);

  let head: string;
  let lead: string;
  if (isEgg && hatchReady) {
    head = T.hatchHead;
    lead = T.hatchLead;
  } else if (starsLit === 0) {
    head = T.zeroHead;
    lead = T.zeroLead;
  } else {
    head = T.head(starsLit);
    lead = isEgg ? T.eggLead(correctCount, n, EGG_HATCH_ANSWERS - cracks) : T.lead(correctCount, n);
  }

  const stageLine = evolved && toStage
    ? T.evolved(toStage)
    : growth.left === null
      ? T.stageMax(stage)
      : growth.left > 0
        ? T.stageLeft(stage, growth.left)
        : T.stageReady(stage);

  return (
    <div className="sd-end">
      <ElementGradient id={gradientId} />
      {overlays}
      <div className="sd-sky">
        <svg className="sd-cons" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
          {links.map((s, i) => {
            if (s === "none") return null;
            const [x1, y1] = points[i];
            const [x2, y2] = points[i + 1];
            const lit = s === "lit";
            return (
              <line
                key={i}
                className={`sd-ln${lit ? " sd-draw" : " soft"}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                pathLength={lit ? 1 : undefined}
                style={
                  lit
                    ? ({
                        animationDelay: `${0.45 + (i + 1) * 0.09}s`,
                      } as CSSProperties)
                    : undefined
                }
              />
            );
          })}
          {points.map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(.55)`}>
              <path
                className={`sd-st${stars[i] === "lit" ? "" : stars[i] === "done-prior" ? " prior" : " soft"}`}
                d={STAR_PATH}
                style={{
                  ...(stars[i] === "lit" ? { fill: `url(#${gradientId})` } : {}),
                  animationDelay: `${i * 0.09}s`,
                }}
              />
            </g>
          ))}
        </svg>
        {img && !imgFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={`sd-sky-pet${isEgg ? " egg" : ""}`}
            src={img}
            alt={isEgg ? STARDUST_TEXT.eggName : name}
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      {speech && <div className="sd-end-say">{speech}</div>}

      <div className="sd-end-txt">
        <h1 className="sd-end-h">{head}</h1>
        <p className="sd-end-lead">{lead}</p>

        {rewards && <div className="sd-rewards">{rewards}</div>}

        <div className="sd-grow">
          {isEgg ? (
            <>
              <div className="sd-grow-row">
                <span className="sd-grow-t">{T.cracks}</span>
                <span className="sd-grow-gain">
                  {cracks}/{EGG_HATCH_ANSWERS}
                </span>
              </div>
              <div className="sd-cracks-row" aria-label={`${T.cracks} ${cracks}/${EGG_HATCH_ANSWERS}`} role="img">
                {Array.from({ length: EGG_HATCH_ANSWERS }, (_, i) => (
                  <i key={i} className={i < cracks ? "on" : undefined} />
                ))}
              </div>
              <p className="sd-grow-d">{T.eggGain(gainExp)}</p>
            </>
          ) : (
            <>
              <div className="sd-grow-row">
                <span className="sd-grow-t">{T.grow(name)}</span>
                <span className="sd-grow-gain">+{gainExp} EXP</span>
              </div>
              <div
                className="sd-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((evolved ? 1 : growth.now) * 100)}
                aria-label={stageLine}
              >
                <i className="add" style={{ width: `${(filled ? (evolved ? 1 : growth.now) : growth.was) * 100}%` }} />
                <i className="was" style={{ width: `${growth.was * 100}%` }} />
              </div>
              <p className="sd-grow-d">{stageLine}</p>
            </>
          )}
          {missionBonusExp !== null && (
            <div className="sd-grow-row sd-grow-extra">
              <span>{T.missionBonus}</span>
              <span className="sd-grow-num">+{missionBonusExp} EXP</span>
            </div>
          )}
          {!!farmCoins && (
            <div className="sd-grow-row sd-grow-extra">
              <span>
                {T.farmCoins} +{farmCoins}
              </span>
              <Link href="/collection/garden" className="sd-link">
                {T.toGarden}
                <ChevronRight strokeWidth={2.6} aria-hidden />
              </Link>
            </div>
          )}
          {capped && <p className="sd-note">{T.capped(name, expAddedToPet ?? 0)}</p>}
          {saveWarning && (
            <p className="sd-warn">
              <TriangleAlert strokeWidth={2.4} aria-hidden />
              <span>{saveWarning}</span>
            </p>
          )}
          {missionClaimFailed && (
            <p className="sd-warn">
              <TriangleAlert strokeWidth={2.4} aria-hidden />
              <span>{T.missionClaimFailed}</span>
            </p>
          )}
        </div>

        {onReview && missedCount > 0 && !hatchReady && (
          <div className="sd-review">
            <p className="sd-review-l">
              <b>{T.reviewTitle(missedCount)}</b>
              {T.reviewSub}
            </p>
            <button type="button" onClick={onReview}>
              {T.reviewBtn}
            </button>
          </div>
        )}

        <div className="sd-acts">
          {hatchReady ? (
            <button type="button" className="sd-btn" onClick={onGoHatch}>
              {T.goHatch}
            </button>
          ) : (
            <>
              {onPlayAgain && (
                <button type="button" className="sd-btn" onClick={onPlayAgain}>
                  {T.playAgain}
                </button>
              )}
              <button type="button" className={`sd-btn${onPlayAgain ? " ghost" : ""}`} onClick={onBack}>
                {T.backTo(isEgg ? STARDUST_TEXT.eggName : name)}
              </button>
            </>
          )}
          {shareCard && gradeBand !== "primary" && <ShareMomentButton card={shareCard} />}
        </div>
      </div>
    </div>
  );
}
