"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Crosshair, Heart, Shield, Sparkles, Swords, Wind, Zap } from "lucide-react";
import { BOSSES, INTENTS, MAX_ENERGY, questionLimit, cardInfo, checkPreview, incomingDamage, phaseNumber, damageProgress, growthAdvice, type Battle, type CardId } from "@/lib/raid/cards/engine";
import styles from "./card-battle.module.css";
import RaidLearningPanel from "./RaidLearningPanel";
import type {RaidCardQuestion,RaidCardFeedback} from "@/lib/raid/cards/server";
import {STAT_REQUIREMENTS,statPercent} from "@/lib/raid/cards/engine";

const ICONS = { attack: Swords, defend: Shield, support: Sparkles };
export type ArenaProps = {
  battle: Battle; petName: string; petImage: string; bestProgress: number;
  busy: boolean; error: string | null; animateTurn: number;
  onPlay: (card: CardId) => void; onReload: () => void; onExit: () => void;
  onReward: () => void; rewardReady?: boolean; demo?: boolean;
  question?:RaidCardQuestion|null; feedback?:RaidCardFeedback|null;
  onAnswer?:(index:number)=>void; onContinue?:()=>void;
};
export default function CardBattleArena({ battle: b, petName, petImage, bestProgress, busy, error, animateTurn, onPlay, onReload, onExit, onReward, rewardReady, demo,question,feedback,onAnswer,onContinue }: ArenaProps) {
  const [selected, setSelected] = useState<CardId | null>(null);
  const boss = BOSSES[b.bossId];
  const quick = b.version === 3;
  const limit = questionLimit(b);
  const intent = INTENTS[b.intent];
  const last = b.log.at(-1);
  const selection = selected && (b.hand.includes(selected) || selected === "guard" || selected === "strike") ? selected : null;
  const card = selection ? cardInfo(b, selection) : null;
  const preview = selection ? checkPreview(b, selection) : null;
  const advice = growthAdvice(b);
  const chanceText = (id: CardId) => {
    const c = checkPreview(b, id);
    if (quick) return `ลุ้นคริติคอล ${c.chance}%`;
    return c.chance === 100 ? "ผ่านแน่นอน" : c.chance === 0 ? "ใช้ผลพื้นฐาน" : `ลุ้นผลพิเศษ ${c.chance}%`;
  };
  function choose(id: CardId) {
    if (busy) return;
    if (quick) { onPlay(id); setSelected(null); }
    else setSelected(id);
  }
  function play() { if (selection && !busy) { onPlay(selection); setSelected(null); } }

  return (
    <main className={`${styles.shell} ${question || feedback ? styles.answering : ""}`} style={{ "--battle-accent": boss.accent } as CSSProperties}>
      <div className={styles.world}>
        <Image src={`/raid/boss_scene_${b.bossId}.webp`} alt="" fill priority sizes="100vw" className={styles.backdrop} />
        <div className={styles.worldShade} />
      </div>
      <div className={styles.layout}>
        <header className={styles.header}>
          <button className={styles.back} onClick={onExit} aria-label="กลับบ้านและเก็บรอบไว้เล่นต่อ"><ArrowLeft size={18} /><span>กลับบ้าน</span></button>
          <div className={styles.location}><span>ภูเหนือเมฆ {demo ? "· สนามทดลอง" : ""}</span><strong>{boss.level}</strong></div>
          <div className={styles.round}><span>{quick ? "ข้อ" : "เทิร์น"}</span><strong>{b.turn}<small> / {limit}</small></strong></div>
        </header>

        <section className={styles.stage} aria-label="สนามต่อสู้">
          <div className={styles.bossHud}>
            <div className={styles.bossTitle}><span className={styles.bossLabel}>ผู้พิทักษ์ด่าน</span><span>ช่วง {phaseNumber(b)} / 3</span></div>
            <h1>{boss.name}</h1>
            <div className={styles.bossHealth} role="progressbar" aria-label="เลือดบอส" aria-valuenow={b.bossHp} aria-valuemin={0} aria-valuemax={boss.hp}>
              <div style={{ width: `${b.bossHp / boss.hp * 100}%` }} />
              <i style={{ left: "35%" }} /><i style={{ left: "70%" }} />
            </div>
            <div className={styles.healthNumbers}><span>{b.bossHp} / {boss.hp}</span><span>ดีที่สุด {Math.max(bestProgress, damageProgress(b))}%</span></div>
          </div>

          <div className={styles.floor} />
          <div key={`boss-${animateTurn}`} className={`${styles.bossSprite} ${animateTurn && last?.dealt ? styles.bossHit : ""} ${b.outcome === "win" ? styles.vanquished : ""}`}>
            <Image src={`/raid/boss_${b.bossId}.png`} alt={boss.name} fill sizes="(max-width: 600px) 68vw, 420px" className={styles.spriteImage} priority />
            {animateTurn > 0 && last && last.dealt > 0 && <span className={styles.damageFloat}>{quick && "critical" in last && last.critical ? "คริติคอล! " : ""}−{last.dealt}</span>}
          </div>
          <div key={`pet-${animateTurn}`} className={`${styles.petSprite} ${animateTurn ? last?.dealt ? styles.petAttack : styles.petGuard : ""}`}>
            <Image src={petImage} alt={petName} fill sizes="(max-width: 600px) 35vw, 210px" className={styles.spriteImage} priority />
            {animateTurn > 0 && last && last.taken > 0 && <span className={styles.petDamage}>−{last.taken}</span>}
            {animateTurn > 0 && last && last.healed > 0 && <span className={styles.healFloat}>+{last.healed}</span>}
          </div>
          <div className={styles.petHud}>
            <strong>{petName}</strong>
            <div className={styles.petHealth} role="progressbar" aria-label="เลือด Qmon" aria-valuenow={b.hp} aria-valuemin={0} aria-valuemax={b.hpMax}><div style={{ width: `${b.hp / b.hpMax * 100}%` }} /></div>
            <span><Heart size={11} /> {b.hp} / {b.hpMax}</span>
          </div>
          {!b.outcome && <div className={styles.intent} key={`${b.turn}-intent`}>
            <div className={styles.intentIcon}>{b.intent === "charge" || b.intent === "thunder" ? <Zap size={22} /> : b.intent === "recover" ? <Crosshair size={22} /> : <Swords size={22} />}</div>
            <div><span>{quick ? "ตอบแล้วลุ้นพลังมอน" : "บอสเตรียมใช้"}</span><h2>{quick ? "มอนพร้อมลุย!" : intent.name}</h2><p>{quick ? "ตอบถูกโจมตีเต็มแรง ตอบผิดมอนยังช่วยตี" : intent.hint}</p></div>
            {!quick && <strong className={styles.threat}>{incomingDamage(b) > 0 ? `~${incomingDamage(b)}` : "—"}<small>ดาเมจก่อนรับมือ</small></strong>}
          </div>}
        </section>

        <section className={styles.controls} aria-label={b.outcome ? "ผลการต่อสู้" : "เลือกการ์ดรับมือ"}>
          {error && <div className={styles.error} role="alert">{error}<button onClick={onReload} disabled={busy}>โหลดสถานะล่าสุด</button></div>}
          <p className={styles.requirements}>{quick ? `จบภายใน ${limit} ข้อ · ตอบถูกแล้ว ${b.log.filter(e=>e.answerCorrect!==false).length} ข้อ · จบรอบมีของรางวัล` : `เกณฑ์ชนะ: stat ${statPercent(b.stats).toFixed(1)} / ${STAT_REQUIREMENTS[b.bossId]}% · ตอบถูก ${b.log.filter(e=>e.answerCorrect!==false).length}/${b.log.length} (ต้อง ≥60%)`}</p>
          {(question || feedback) ? <RaidLearningPanel key={`${(question || feedback!.question).revision}-${!!feedback}`} question={question || feedback!.question} feedback={feedback} busy={busy} shortRound={quick} onAnswer={onAnswer!} onContinue={onContinue!}/> : b.outcome ? (
            <div className={styles.summary}>
              <span className={styles.eyebrow}>{b.outcome === "win" ? "พิชิตผู้พิทักษ์" : "แผนรอบหน้าเริ่มที่นี่"}</span>
              <h2>{b.outcome === "win" ? "ทำได้แล้ว!" : quick ? "จบรอบแล้ว รับรางวัลกัน!" : b.defeatReason === "stats" || b.defeatReason === "learning" ? "ยังไม่ผ่านเกณฑ์ด่าน" : b.turn >= limit && b.hp > 0 ? "ครบเวลาท้าทายแล้ว" : "กลับมาตั้งหลักกัน"}</h2>
              <p>{b.outcome === "win" ? `${petName} พิชิต${boss.name} ใน ${b.turn} ${quick ? "ข้อ" : "เทิร์น"}` : `ลดเลือดบอสได้ ${damageProgress(b)}% • สถิติเดิม ${bestProgress}%`}</p>
              <div className={styles.advice}><Sparkles size={20} /><span>{advice.text}</span></div>
              <button className={styles.primary} disabled={busy} onClick={onReward}>{busy ? "กำลังเปิดหีบ..." : rewardReady ? "ดูอุปกรณ์ที่ได้รับ" : demo ? "ทดลองอีกครั้ง" : "เปิดหีบรางวัล"}<ArrowUpRight size={18} /></button>
              <p className={styles.finePrint}>{demo ? "สนามทดลองไม่ใช้กุญแจและไม่แจกของจริง" : "จบรอบได้อุปกรณ์เสมอ • มอนและของเดิมยังอยู่ครบ"}</p>
            </div>
          ) : (
            <>
              <div className={styles.handHeader}>
                <div><span className={styles.eyebrow}>{quick ? "เลือกท่า · ตอบคำถาม · ลุ้นพลัง" : "อ่านสถานการณ์ · เลือกจังหวะของเรา"}</span><h2>{quick ? "ให้มอนลุยแบบไหนดี?" : "จะรับมืออย่างไร?"}</h2></div>
                {!quick && <div className={styles.energy} aria-label={`พลัง ${b.energy} จาก ${MAX_ENERGY}`}><Zap size={15} />{Array.from({ length: MAX_ENERGY }, (_, i) => <i key={i} className={i < b.energy ? styles.energyFull : ""} />)}<span>{b.energy}/{MAX_ENERGY}</span></div>}
              </div>
              {(b.momentum > 0 || b.exposed || b.turn > 12) && <div className={styles.statuses}>
                {b.momentum > 0 && <span><Zap size={12} /> แรงส่ง +{b.momentum * 100}%</span>}
                {b.exposed && <span><Crosshair size={12} /> จุดอ่อนเปิด</span>}
                {b.turn > 12 && <span>บอสเร่งพลัง • ดาเมจเพิ่มตามเทิร์น</span>}
              </div>}
              <div className={`${styles.hand} ${quick ? styles.shortHand : ""}`}>
                {b.hand.map((id) => {
                  const c = cardInfo(b,id); const Icon = ICONS[c.kind]; const affordable = quick || c.cost <= b.energy;
                  return <button key={id} data-card={id} className={`${styles.card} ${styles[c.kind]} ${selection === id ? styles.selected : ""}`} aria-pressed={selection === id} onClick={() => choose(id)} disabled={busy}>
                    {!quick && <div className={styles.cardTop}><span>{c.stat?.toUpperCase()}</span><span className={!affordable ? styles.lowEnergy : ""}><Zap size={12} />{c.cost}</span></div>}
                    <div className={styles.cardIllustration}><Icon size={31} strokeWidth={1.35} /><span /></div>
                    <h3>{c.name}</h3><p>{chanceText(id)}</p>
                    <small>{!affordable ? "พลังไม่พอ" : c.kind === "attack" ? "โจมตี" : c.kind === "defend" ? "รับมือ" : "เสริมพลัง"}</small>
                  </button>;
                })}
              </div>
              {!quick && <div className={styles.basics}>
                <span>ใช้ได้เสมอ</span>
                <button aria-pressed={selection === "strike"} onClick={() => choose("strike")} disabled={busy}><Swords size={15} />โจมตี</button>
                <button aria-pressed={selection === "guard"} onClick={() => choose("guard")} disabled={busy}><Shield size={15} />ตั้งหลัก <small>+พลัง</small></button>
              </div>}
              <div className={styles.cardDetail} aria-live="polite">
                {card && preview ? <><div><strong>{card.name}</strong>{!quick && <span>{card.stat?.toUpperCase()} {preview.value} {selection !== "guard" && selection !== "strike" ? `/ เกณฑ์ ${preview.dc}` : ""}</span>}</div><p>{card.description}</p><small>{chanceText(selection!)} • {card.success}</small></> :
                  <p className={styles.prompt}>{busy ? "กำลังลงมือและบันทึกผล..." : quick ? "เลือกได้ทั้งสองใบ ไม่ต้องสะสมพลัง" : "แตะการ์ดเพื่อดูผลก่อนใช้ • ใบที่ยังไม่ใช้เก็บไว้รอบหน้าได้"}</p>}
              </div>
              {!quick && <button className={styles.primary} data-testid="play-card" disabled={busy || !selection || !preview?.affordable} onClick={play}>
                {busy ? "กำลังเตรียมโจทย์..." : !selection ? "เลือกการ์ดของเธอ" : !preview?.affordable ? "พลังไม่พอ • ลองตั้งหลัก" : `ตอบเพื่อใช้${cardInfo(b,selection).name}`}<ArrowUpRight size={18} />
              </button>}
              {last && <div className={styles.lastTurn} role="status"><span>เทิร์น {last.turn}</span><p>{last.note} · ทำดาเมจ {last.dealt} / รับ {last.taken}{last.healed ? ` / ฟื้น ${last.healed}` : ""}</p></div>}
            </>
          )}
          <details className={styles.journal}><summary>บันทึกการต่อสู้ · {b.log.length} เทิร์น</summary>
            {b.log.length === 0 ? <p>ยังไม่มีเทิร์นที่เล่น</p> : b.log.toReversed().map((entry) => <p key={entry.turn}><strong>{entry.turn}. {cardInfo(b,entry.card).name}</strong>{!quick && ` → ${INTENTS[entry.intent].name}`}<br />{entry.note}{!quick && entry.roll !== null ? ` (ทอย ${entry.roll} / โอกาส ${entry.chance}%)` : ""}<br />ทำดาเมจ {entry.dealt} · รับ {entry.taken} · ฟื้น {entry.healed}</p>)}
          </details>
          <details className={styles.journal}><summary>วิธีเล่นและสเตตัสของมอน</summary><p>{quick ? `เลือกท่าแล้วตอบคำถามไม่เกิน ${limit} ข้อ ตอบถูกโจมตีเต็มแรงและลุ้นคริติคอล ตอบผิดมอนยังช่วยโจมตี บอสล้มก่อนจบได้ทันที ครบข้อรับรางวัลตามผลงาน สเตตัสช่วยเพิ่มพลังแต่ไม่มีเกณฑ์ขั้นต่ำเพื่อชนะ` : "ลดเลือดบอสให้หมดภายใน 20 เทิร์น เลือกคำสั่งพื้นฐานได้เสมอ จบเทิร์นฟื้นพลัง 1 ตั้งแต่เทิร์น 13 บอสโจมตีแรงขึ้น การ์ดที่ใช้จะพักในกองทิ้งก่อนกลับมาจั่วได้ ไม่มี EXP จากการใช้การ์ด"}</p><p>{Object.entries(b.stats).map(([key, value]) => `${key.toUpperCase()} ${value}`).join(" · ")}</p></details>
        </section>
        <footer className={styles.footer}><Wind size={12} />{quick ? "ตอบนิด ลุ้นหน่อย แล้วรับของกลับบ้าน" : boss.subtitle}</footer>
      </div>
    </main>
  );
}
