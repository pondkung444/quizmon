"use client";

import { Swords, Shield, Sparkles } from "lucide-react";
import { CHAPTER_CARDS, type ChapterOffer } from "@/lib/raid/cards/engine";
import styles from "./card-battle.module.css";
import LessonCardHeading from "@/components/quiz/LessonCardHeading";

const ICONS = { attack: Swords, defend: Shield, support: Sparkles };
export default function RaidChapterHand({
  offers,
  busy,
  onSelect,
  onFinish,
}: {
  offers: ChapterOffer[];
  busy: boolean;
  onSelect: (id: string) => void;
  onFinish?: () => void;
}) {
  return (
    <div>
      <div className={styles.handHeader}>
        <div>
          <span className={styles.eyebrow}>
            เลือกบทที่มั่นใจ · ใช้สกิลรับมือบอส
          </span>
          <h2>จะสู้ด้วยบทไหนดี?</h2>
        </div>
      </div>
      <p className={styles.chapterHint}>
        ตอบถูก ใช้สกิลได้ตามเงื่อนไข · ตอบผิด โจมตีเบา 25%
      </p>
      <div className={styles.chapterHand} aria-label="บทเรียนพร้อมสกิล">
        {offers.map((offer) => {
          const skill = CHAPTER_CARDS[offer.cardId];
          if (!skill) return null;
          const Icon = ICONS[skill.kind];
          return (
            <button
              key={offer.id}
              type="button"
              data-offer={offer.id}
              data-skill={offer.cardId}
              className={`${styles.chapterCard} ${styles[skill.kind]}`}
              disabled={busy}
              onClick={() => onSelect(offer.id)}
            >
              <LessonCardHeading
                subject={offer.subject}
                chapter={offer.chapter}
                difficulty={offer.difficulty}
                subjectClassName={styles.chapterSubject}
                chapterClassName={styles.chapterTitle}
              />
              <strong className={styles.chapterSkill}>
                <Icon size={18} />
                {skill.name}
              </strong>
              <p>{skill.description}</p>
              <span className={styles.chapterCta}>
                {busy ? "กำลังเตรียมโจทย์…" : "เลือกบทนี้ →"}
              </span>
            </button>
          );
        })}
      </div>
      {offers.length > 0 && offers.length < 4 && (
        <p role="status" className={styles.chapterHint}>
          เหลือบทที่มีโจทย์พร้อมใช้ {offers.length} บท เลือกเล่นต่อได้เลย
        </p>
      )}
      {offers.length === 0 && (
        <div role="status">
          <p>ไม่มีโจทย์ใหม่พร้อมใช้ในช่วงชั้นนี้ จบรอบและรับของตามผลงานได้</p>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !onFinish}
            onClick={onFinish}
          >
            จบการท้าทาย
          </button>
        </div>
      )}
    </div>
  );
}
