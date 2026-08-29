"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, Dice5, RotateCcw, XCircle } from "lucide-react";

import { submitBulkHumanApproval, submitHumanReview, type HumanReviewActionState } from "@/app/admin/question-factory/review/actions";
import type { FactoryReviewQueueItem } from "@/lib/questionFactory/reviewQueueServer";

const INITIAL_ACTION_STATE: HumanReviewActionState = { status: "idle", message: "" };

function pickDifferentIndex(length: number, current: number): number {
  if (length <= 1) return 0;
  const offset = 1 + Math.floor(Math.random() * (length - 1));
  return (current + offset) % length;
}

function DecisionButtons({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const locked = disabled || pending;
  return (
    <div className="flex flex-wrap gap-3">
      <button name="decision" value="APPROVE" disabled={locked} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={18} /> อนุมัติ</button>
      <button name="decision" value="REQUEST_REVISION" disabled={locked} className="inline-flex items-center gap-2 rounded-xl bg-amber-dim px-4 py-3 text-sm font-bold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={18} /> ส่งกลับแก้ไข</button>
      <button name="decision" value="REJECT" disabled={locked} className="inline-flex items-center gap-2 rounded-xl bg-red/70 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><XCircle size={18} /> ปฏิเสธ</button>
    </div>
  );
}

function BulkApproveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || count === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40">
      <CheckCircle2 size={17} /> {pending ? "กำลังอนุมัติ…" : `อนุมัติที่เลือก (${count})`}
    </button>
  );
}

export default function FactoryReviewQueue({ items }: { items: FactoryReviewQueueItem[] }) {
  const router = useRouter();
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState(items[0]?.slotId ?? 0);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [actionState, formAction] = useActionState(async (previous: HumanReviewActionState, formData: FormData) => {
    const result = await submitHumanReview(previous, formData);
    if (result.processedSlotIds?.length) {
      setDismissedIds((current) => [...new Set([...current, ...result.processedSlotIds!])]);
      router.refresh();
    }
    return result;
  }, INITIAL_ACTION_STATE);
  const [bulkActionState, bulkFormAction] = useActionState(async (previous: HumanReviewActionState, formData: FormData) => {
    const result = await submitBulkHumanApproval(previous, formData);
    if (result.processedSlotIds?.length) {
      setDismissedIds((current) => [...new Set([...current, ...result.processedSlotIds!])]);
      setCheckedIds((current) => current.filter((slotId) => !result.processedSlotIds!.includes(slotId)));
      router.refresh();
    }
    return result;
  }, INITIAL_ACTION_STATE);
  const visibleItems = items.filter((queueItem) => !dismissedIds.includes(queueItem.slotId));
  const selectedIndex = Math.max(0, visibleItems.findIndex((item) => item.slotId === selectedId));
  const item = visibleItems[selectedIndex];
  const bulkEligibleItems = visibleItems.filter((queueItem) => queueItem.state === "pending_human_review" && queueItem.mappingCandidate);
  const eligibleIds = new Set(bulkEligibleItems.map((queueItem) => queueItem.slotId));
  const checkedEligibleIds = checkedIds.filter((id) => eligibleIds.has(id));
  const allEligibleChecked = bulkEligibleItems.length > 0 && checkedEligibleIds.length === bulkEligibleItems.length;
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
            <p className="text-xs text-text3">{visibleItems.length} ข้อ</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedId(visibleItems[pickDifferentIndex(visibleItems.length, selectedIndex)].slotId)}
            className="inline-flex items-center gap-2 rounded-xl border border-gold-dim bg-track px-3 py-2 text-xs font-semibold text-gold-hi hover:border-gold"
          >
            <Dice5 size={16} /> สุ่มดู
          </button>
        </div>
        {bulkEligibleItems.length > 0 && (
          <form action={bulkFormAction} className="mb-3 space-y-2 rounded-2xl border border-emerald-800/60 bg-emerald-950/20 p-3">
            {checkedEligibleIds.map((slotId) => <input key={slotId} type="hidden" name="slotIds" value={slotId} />)}
            <label className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
              <input
                type="checkbox"
                checked={allEligibleChecked}
                onChange={(event) => setCheckedIds(event.target.checked ? bulkEligibleItems.map((queueItem) => queueItem.slotId) : [])}
                className="h-4 w-4 accent-emerald-600"
              />
              เลือกทั้งหมดที่พร้อมอนุมัติ ({bulkEligibleItems.length})
            </label>
            <BulkApproveButton count={checkedEligibleIds.length} />
            {bulkActionState.message && (
              <p className={`text-[11px] ${bulkActionState.status === "success" ? "text-emerald-300" : "text-red-300"}`} role="status">{bulkActionState.message}</p>
            )}
          </form>
        )}
        <div className="mt-2 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {visibleItems.map((queueItem) => (
            <div
              key={queueItem.slotId}
              className={`flex w-full items-start rounded-2xl border text-left transition ${
                queueItem.slotId === item.slotId
                  ? "border-gold bg-gold-dim/25"
                  : "border-border bg-track hover:border-indigo"
              }`}
            >
              {queueItem.state === "pending_human_review" && queueItem.mappingCandidate && (
                <input
                  type="checkbox"
                  checked={checkedIds.includes(queueItem.slotId)}
                  onChange={(event) => setCheckedIds((current) => event.target.checked
                    ? [...current, queueItem.slotId]
                    : current.filter((id) => id !== queueItem.slotId))}
                  aria-label={`เลือกข้อ ${queueItem.ordinal} เพื่ออนุมัติพร้อมกัน`}
                  className="ml-3 mt-3 h-4 w-4 shrink-0 accent-emerald-600"
                />
              )}
              <button type="button" onClick={() => setSelectedId(queueItem.slotId)} className="min-w-0 flex-1 p-3 text-left">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gold-hi">#{queueItem.ordinal} · {queueItem.slotKey}</span>
                  <span className="rounded-full bg-indigo-dim px-2 py-0.5 text-[10px] text-indigo-hi">
                    {queueItem.state !== "approved" ? `ยาก ${queueItem.question.difficulty}` :
                      queueItem.questionId === null ? "รอ Draft" :
                      queueItem.asset?.state === "qc_passed" ? "รอโปรโมตภาพ" : "พร้อม Activation"}
                  </span>
                </span>
                <span className="mt-2 line-clamp-2 text-sm text-text">{queueItem.question.questionText}</span>
                <span className="mt-2 block truncate text-[11px] text-text3">{queueItem.slotSpec.topic}</span>
              </button>
            </div>
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
          {item.mappingCandidate ? (
            <div className="mb-4 rounded-2xl border border-emerald-700/60 bg-emerald-950/25 p-3 text-xs text-emerald-200">
              <p className="font-semibold">Product Mapping พร้อมตรวจ</p>
              <p className="mt-1">{item.mappingCandidate.productRow.category}</p>
              <p className="mt-1 break-all text-[10px] text-emerald-300/80">{item.mappingCandidate.checksum}</p>
            </div>
          ) : (
            <div className="mb-4 rounded-2xl border border-amber-700/60 bg-amber-950/25 p-3 text-xs text-amber-200">
              <p className="font-semibold">ยังตัดสินใจไม่ได้</p>
              <p className="mt-1">{item.mappingError ?? "ไม่พบ Product Mapping Candidate"}</p>
            </div>
          )}
          <form key={item.slotId} action={formAction} className="space-y-4">
            <input type="hidden" name="slotId" value={item.slotId} />
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              <label className="text-xs text-text2">
                เป้าหมายเมื่อส่งกลับ
                <select name="revisionTarget" defaultValue="text" className="mt-1 w-full rounded-xl border border-border bg-track px-3 py-2 text-sm text-text">
                  <option value="text">แก้ข้อความ/คำตอบ</option>
                  <option value="asset" disabled={!item.asset}>แก้ภาพ</option>
                </select>
              </label>
              <label className="text-xs text-text2">
                เหตุผล (จำเป็นเมื่อส่งกลับหรือปฏิเสธ)
                <textarea name="feedback" rows={2} maxLength={1000} className="mt-1 w-full rounded-xl border border-border bg-track px-3 py-2 text-sm text-text" placeholder="ระบุจุดที่ต้องแก้ให้ชัดเจน" />
              </label>
            </div>
            <DecisionButtons disabled={!item.mappingCandidate} />
          </form>
          {actionState.message && (
            <p className={`mt-3 text-xs ${actionState.status === "success" ? "text-emerald-300" : "text-red-300"}`} role="status">{actionState.message}</p>
          )}
        </div>
      </section>
    </div>
  );
}
