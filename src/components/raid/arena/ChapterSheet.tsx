"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { groupRaidChapters, toggleRaidChapter, MAX_RAID_CHAPTERS, type RaidChapterList } from "./chapters";
import styles from "./select.module.css";

export type ChapterSelection = { auto: boolean; keys: string[] };

export default function ChapterSheet({ list, value, onDone }: {
  list: RaidChapterList;
  value: ChapterSelection;
  onDone: (next: ChapterSelection) => void;
}) {
  const [sel, setSel] = useState(value);
  const groups = useMemo(() => groupRaidChapters(list), [list]);
  const full = !sel.auto && sel.keys.length >= MAX_RAID_CHAPTERS;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(sel); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, onDone]);

  return <div className={styles.sheetWrap}>
    <div className={styles.scrim} onClick={() => onDone(sel)} />
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="เลือกบท">
      <div className={styles.grab} />
      <h3>โจทย์มาจากบทไหน</h3>
      <p className={styles.lead}>เลือกได้สูงสุด {MAX_RAID_CHAPTERS} บท โจทย์ทุกข้อในรอบนี้จะมาจากบทที่เลือก</p>
      <div className={styles.sheetScroll}>
        <button type="button" className={`${styles.opt} ${styles.optAuto} ${sel.auto ? styles.on : ""}`} aria-pressed={sel.auto}
          onClick={() => setSel({ auto: true, keys: [] })}>
          <span className={styles.box}><Check size={18} strokeWidth={3} /></span>
          <span className={styles.grow}><span className={styles.n}>ให้ระบบเลือกให้</span><span className={styles.s}>บทที่ฝึกบ่อยในช่วงชั้นของเรา</span></span>
        </button>
        {groups.map((g) => <div key={g.title}>
          <p className={styles.groupTitle}>{g.title}</p>
          {g.chapters.map((c) => {
            const on = !sel.auto && sel.keys.includes(c.key);
            return <button key={c.key} type="button" className={`${styles.opt} ${on ? styles.on : ""}`} aria-pressed={on}
              disabled={full && !on} onClick={() => setSel((s) => toggleRaidChapter(s, c.key))}>
              <span className={styles.box}><Check size={18} strokeWidth={3} /></span>
              <span className={styles.grow}><span className={styles.n}>{c.chapter}</span><span className={styles.s}>{c.subjectLabel}{c.gradeLevel ? ` ${c.gradeLevel}` : ""}</span></span>
            </button>;
          })}
        </div>)}
      </div>
      <div className={styles.sheetFoot}>
        {full && <p className={styles.full} role="status">เลือกครบ {MAX_RAID_CHAPTERS} บทแล้ว เอาบทเดิมออกก่อนถึงจะเลือกบทใหม่ได้</p>}
        <button type="button" className={styles.cta} onClick={() => onDone(sel)}>ใช้บทเหล่านี้</button>
      </div>
    </div>
  </div>;
}
