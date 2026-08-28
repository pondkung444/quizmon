"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Dice5, RotateCcw, XCircle } from "lucide-react";

import type { FactoryReviewQueueItem } from "@/lib/questionFactory/reviewQueueServer";

function pickDifferentIndex(length: number, current: number): number {
  if (length <= 1) return 0;
  const offset = 1 + Math.floor(Math.random() * (length - 1));
  return (current + offset) % length;
}

export default function FactoryReviewQueue({ items }: { items: FactoryReviewQueueItem[] }) {
  const [selectedId, setSelectedId] = useState(items[0]?.slotId ?? 0);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.slotId === selectedId));
  const item = items[selectedIndex];
  const queuedLabel = item ? new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
  }).format(new Date(item.queuedAt)) : "";

  if (!item) {
    return (
      <section className="rounded-3xl border border-gold-dim bg-card p-8 text-center">
        <h2 className="text-lg font-bold text-gold-hi">ยังไม่มีข้อรอตรวจ</h2>
        <p className="mt-2 text-sm text-text2">เมื่อข้อผ่าน Question QC และ Image QC แล้ว จะปรากฏในคิวนี้อัตโนมัติ</p>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-border bg-card p-3 lg:sticky lg:top-4 lg:self-start">
        <div className="flex items-center justify-between px-2 py-2">
          <div>
            <h2 className="font-bold text-text">คิวรอตรวจ</h2>
            <p className="text-xs text-text3">{items.length} ข้อ</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedId(items[pickDifferentIndex(items.length, selectedIndex)].slotId)}
            className="inline-flex items-center gap-2 rounded-xl border border-gold-dim bg-track px-3 py-2 text-xs font-semibold text-gold-hi hover:border-gold"
          >
            <Dice5 size={16} /> สุ่มดู
          </button>
        </div>
        <div className="mt-2 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {items.map((queueItem) => (
            <button
              key={queueItem.slotId}
              type="button"
              onClick={() => setSelectedId(queueItem.slotId)}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                queueItem.slotId === item.slotId
                  ? "border-gold bg-gold-dim/25"
                  : "border-border bg-track hover:border-indigo"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gold-hi">#{queueItem.ordinal} · {queueItem.slotKey}</span>
                <span className="rounded-full bg-indigo-dim px-2 py-0.5 text-[10px] text-indigo-hi">ยาก {queueItem.question.difficulty}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-text">{queueItem.question.questionText}</p>
              <p className="mt-2 truncate text-[11px] text-text3">{queueItem.slotSpec.topic}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-5">
        <div className="rounded-3xl border border-gold-dim bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Human Review</p>
              <h2 className="mt-1 text-xl font-bold text-text">ข้อ #{item.ordinal}</h2>
              <p className="mt-1 text-xs text-text3">เข้าคิว {queuedLabel} · revision {item.question.revision}</p>
            </div>
            <div className="rounded-2xl border border-border bg-track px-3 py-2 text-right text-xs text-text2">
              <p>{item.runKey}</p>
              <p className="mt-1 text-text3">state version {item.stateVersion}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-track p-5">
            <p className="text-lg leading-8 text-text">{item.question.questionText}</p>
          </div>

          {item.asset && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white p-4">
              <div className="relative mx-auto aspect-[3/2] max-w-2xl">
                <Image
                  src={item.asset.signedPreviewUrl}
                  alt={`ภาพประกอบข้อ ${item.ordinal}`}
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 90vw, 720px"
                  className="object-contain"
                />
              </div>
              <p className="mt-2 break-all text-center text-[10px] text-zinc-600">
                asset rev {item.asset.revision} · {item.asset.checksum}
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {item.question.choices.map((choice, index) => {
              const correct = index === item.question.correctIndex;
              return (
                <div key={`${index}-${choice}`} className={`rounded-2xl border p-4 ${
                  correct ? "border-emerald-500/70 bg-emerald-950/30" : "border-border bg-track"
                }`}>
                  <div className="flex gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      correct ? "bg-emerald-500 text-white" : "bg-border text-text2"
                    }`}>{String.fromCharCode(65 + index)}</span>
                    <p className="pt-0.5 text-sm leading-6 text-text">{choice}</p>
                  </div>
                  {correct && <p className="mt-2 text-xs font-semibold text-emerald-300">คำตอบที่ถูก</p>}
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-indigo-dim bg-indigo-dim/20 p-4">
            <h3 className="text-sm font-bold text-indigo-hi">คำอธิบาย</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text">{item.question.explanation}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-gold-hi">ข้อมูลตรวจสอบ</h3>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
            <div><dt className="text-text3">Scope</dt><dd className="mt-1 break-all text-text">{item.scopeKey}</dd></div>
            <div><dt className="text-text3">Topic</dt><dd className="mt-1 text-text">{item.slotSpec.topic}</dd></div>
            <div><dt className="text-text3">Learning objective</dt><dd className="mt-1 text-text">{item.slotSpec.learningObjective}</dd></div>
            <div><dt className="text-text3">Cognitive demand</dt><dd className="mt-1 text-text">{item.slotSpec.cognitiveDemand}</dd></div>
            <div><dt className="text-text3">Archetype</dt><dd className="mt-1 text-text">{item.slotSpec.questionArchetype}</dd></div>
            <div><dt className="text-text3">Representation</dt><dd className="mt-1 text-text">{item.slotSpec.representationType}</dd></div>
          </dl>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="flex flex-wrap gap-3">
            <button disabled className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-emerald-100 opacity-50"><CheckCircle2 size={18} /> อนุมัติ</button>
            <button disabled className="inline-flex items-center gap-2 rounded-xl bg-amber-dim px-4 py-3 text-sm font-bold text-amber-100 opacity-50"><RotateCcw size={18} /> ส่งกลับแก้ไข</button>
            <button disabled className="inline-flex items-center gap-2 rounded-xl bg-red/70 px-4 py-3 text-sm font-bold text-white opacity-50"><XCircle size={18} /> ปฏิเสธ</button>
          </div>
          <p className="mt-3 text-xs text-text3">ปุ่มตัดสินใจจะเปิดหลัง Human Review RPC ผ่าน replay, stale-version และ rollback smoke test</p>
        </div>
      </section>
    </div>
  );
}
