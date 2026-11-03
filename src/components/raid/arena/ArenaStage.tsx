"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { Home } from "lucide-react";
import { BOSSES, questionLimit, type ChapterBattle } from "@/lib/raid/cards/engine";
import { useSfx } from "@/lib/audio/useSfx";
import BgmMuteButton from "@/components/audio/BgmMuteButton";
import { MOVES, INTENT_LABELS, threatLevel } from "./moves";
import styles from "./arena.module.css";

type Float = { id: number; className: string; text: string; left: string; top: string };

export default function ArenaStage({ battle: b, petName, petImage, playToken, tight, thin, onHome }: {
  battle: ChapterBattle;
  petName: string;
  petImage: string;
  playToken: number;
  tight: boolean;
  thin: boolean;
  onHome: () => void;
}) {
  const sfx = useSfx();
  const sfxRef = useRef(sfx);
  useEffect(() => { sfxRef.current = sfx; }, [sfx]);
  const boss = BOSSES[b.bossId];
  const limit = questionLimit(b);
  const [shown, setShown] = useState({ boss: b.bossHp, pet: b.hp });
  const [petAnim, setPetAnim] = useState("");
  const [bossAnim, setBossAnim] = useState("");
  const [floats, setFloats] = useState<Float[]>([]);
  const [banner, setBanner] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Layout effect: bars must start from the pre-hit values before the first paint of the new state.
  useLayoutEffect(() => {
    const last = b.log.at(-1);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!playToken || !last || last.turn === undefined || reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- final values on resume or reduced motion
      setShown({ boss: b.bossHp, pet: b.hp });
      return;
    }
    const reflected = last.reflected ?? 0;
    const hit = last.dealt - reflected;
    const prevBoss = b.bossHp + last.dealt;
    const prevPet = b.hp + last.taken - last.healed;
    setShown({ boss: prevBoss, pet: prevPet });
    setPlaying(true);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
    let id = 0;
    const float = (className: string, text: string, left: string, top: string) => {
      const entry = { id: ++id, className, text, left, top };
      setFloats((list) => [...list, entry]);
      at(1400, () => setFloats((list) => list.filter((f) => f !== entry)));
    };
    const defensive = MOVES[last.card]?.kind === "def" && last.answerCorrect !== false;
    setPetAnim(defensive ? styles.guard : styles.lunge);
    at(230, () => {
      setBossAnim(styles.hurt);
      float(last.answerCorrect === false ? styles.small : "", `−${hit}`, "58%", "34%");
      setShown((s) => ({ ...s, boss: prevBoss - hit }));
      sfxRef.current("pvp_card");
    });
    if (last.healed) at(520, () => {
      float(`${styles.heal} ${styles.small}`, `+${last.healed}`, "12%", "48%");
      setShown((s) => ({ ...s, pet: prevPet + last.healed }));
    });
    if (last.taken) {
      at(760, () => setBossAnim(styles.strike));
      at(980, () => {
        setPetAnim(styles.hurt);
        float(styles.taken, `−${last.taken}`, "14%", "52%");
        setShown((s) => ({ ...s, pet: b.hp }));
      });
    }
    // Counter damage lands after the boss's own attack.
    if (reflected) at(1180, () => {
      setBossAnim(styles.hurt);
      float(styles.small, `−${reflected}`, "58%", "34%");
      setShown((s) => ({ ...s, boss: b.bossHp }));
    });
    const endAt = reflected ? 1400 : 700;
    if (b.outcome === "win") at(endAt, () => {
      setBossAnim(styles.down);
      setBanner(true);
      sfxRef.current("pvp_win");
    });
    if (b.outcome && b.hp === 0) at(1250, () => setPetAnim(styles.petDown));
    at(2200, () => {
      setPlaying(false);
      if (!b.outcome) { setPetAnim(""); setBossAnim(""); }
    });
    return () => {
      timers.forEach(clearTimeout);
      setFloats([]);
      setPlaying(false);
    };
    // A new token starts one sequence; the battle object belongs to that token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken, b.bossHp, b.hp]);

  const settled = !playing;
  const intent = INTENT_LABELS[b.intent];
  const IntentIcon = intent?.icon;
  const threat = threatLevel(b);
  const won = settled && b.outcome === "win";
  const koed = settled && !!b.outcome && b.hp === 0;
  const answered = b.log.length;

  return <section className={`${styles.arena} ${won ? styles.won : ""} ${koed ? styles.ko : ""} ${tight ? styles.tight : ""} ${thin ? styles.thin : ""}`} aria-label="สนามต่อสู้">
    <Image src={`/raid/boss_scene_${b.bossId}.webp`} alt="" fill priority sizes="(min-width:1024px) 60vw, 100vw" className={styles.scene} />
    <span className={styles.shade} /><span className={styles.ground} />
    <div className={styles.top}>
      <button type="button" className={styles.iconBtn} onClick={onHome} aria-label="กลับบ้าน เก็บรอบไว้เล่นต่อ"><Home size={22} /></button>
      <div className={styles.where}><span>ภูเหนือเมฆ</span><strong>{boss.level}</strong></div>
      <div className={styles.pips} aria-label={`ข้อที่ ${Math.min(answered + 1, limit)} จาก ${limit}`}>
        {Array.from({ length: limit }, (_, i) => {
          const entry = b.log[i];
          const cls = entry ? (entry.answerCorrect === false ? styles.soft : styles.hit) : i === answered && !b.outcome ? styles.now : "";
          return <i key={i} className={cls} />;
        })}
      </div>
      <BgmMuteButton className={styles.mute} />
    </div>
    <div className={styles.bossBar}>
      <div className={styles.nm}><strong>{boss.name}</strong><span>{shown.boss} / {boss.hp}</span></div>
      <div className={`${styles.hp} ${styles.hpBoss}`} role="progressbar" aria-label="เลือดบอส" aria-valuemin={0} aria-valuemax={boss.hp} aria-valuenow={shown.boss}><div style={{ width: `${shown.boss / boss.hp * 100}%` }} /></div>
    </div>
    <div className={`${styles.sprite} ${styles.sBoss} ${bossAnim}`}><Image src={`/raid/boss_${b.bossId}.png`} alt={boss.name} fill sizes="(max-width:600px) 60vw, 420px" priority /></div>
    <div className={`${styles.sprite} ${styles.sPet} ${petAnim}`}><Image src={petImage} alt={petName} fill sizes="(max-width:600px) 35vw, 210px" priority /></div>
    <div className={styles.petTag}>
      <div className={styles.nm}><strong>{petName}</strong><span>{shown.pet} / {b.hpMax}</span></div>
      <div className={`${styles.hp} ${styles.hpPet}`} role="progressbar" aria-label={`เลือด ${petName}`} aria-valuemin={0} aria-valuemax={b.hpMax} aria-valuenow={shown.pet}><div style={{ width: `${shown.pet / b.hpMax * 100}%` }} /></div>
    </div>
    {!b.outcome && intent && IntentIcon && <div className={styles.intent}>
      <span className={styles.intentIcon}><IntentIcon size={22} /></span>
      <span>
        <b>บอสกำลัง</b><strong>{intent.name}</strong>
        {threat > 0 && <span className={styles.threat} aria-label={`แรงระดับ ${threat} จาก 3`}>{[1, 2, 3].map((n) => <i key={n} className={n <= threat ? styles.on : ""} />)}</span>}
      </span>
    </div>}
    {floats.map((f) => <span key={f.id} className={`${styles.dmg} ${f.className}`} style={{ left: f.left, top: f.top }}>{f.text}</span>)}
    {(banner || won) && <div className={styles.banner}>ชนะแล้ว!</div>}
  </section>;
}
