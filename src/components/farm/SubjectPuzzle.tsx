"use client";
import { useState } from "react";
import type { PuzzleView } from "@/lib/farm/puzzle-engine";
import type { HintTier } from "@/lib/farm/puzzles/core";
import { useDraftAutosave } from "./useDraftAutosave";
import styles from "./subject-puzzle.module.css";
export type SubjectDraft = {
  tiles: { r: number; c: number; kind: "I" | "L"; rot: number }[];
  slots: { plot: number; factorId: string; cardId: string }[];
  placements: { weightId: string; pos: number }[];
  order: string[];
};
const empty: SubjectDraft = { tiles: [], slots: [], placements: [], order: [] };
const guides = {
  pond: "ต่อท่อให้น้ำเดินจากทะเล ผ่านระเหย → ควบแน่น → ฝนตก → ไหลสะสม แล้วกลับสู่ทะเล",
  flower:
    "อ่านผลทดลองแต่ละแปลง แล้วเลือกการ์ดให้ตรงกับแสง น้ำ และดินที่ระบุ การ์ดหนึ่งใบใช้ได้ช่องเดียว",
  bridge:
    "วางน้ำหนักทุกก้อนให้สมดุล น้ำหนัก × ระยะจากจุดหมุนทางซ้าย ต้องเท่ากับทางขวา",
  observatory: "วางดาวจากใกล้ไปไกลดวงอาทิตย์ ใช้ดาวที่วางไว้และเบาะแสช่วยคิด",
};
const titles = {
  pond: "วัฏจักรน้ำ",
  flower: "พืชสร้างอาหารได้อย่างไร",
  bridge: "คานและสมดุล",
  observatory: "วงโคจรดาวเคราะห์",
};
function Pipe({ sides }: { sides: number[] }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="11" fill="#23b7ca" />
      {sides.map((d) => (
        <path
          key={d}
          d={["M50 50 V0", "M50 50 H100", "M50 50 V100", "M50 50 H0"][d]}
          stroke="#23b7ca"
          strokeWidth="18"
        />
      ))}
    </svg>
  );
}
export default function SubjectPuzzle({
  puzzle,
  initialDraft,
  onDraft,
  onSubmit,
  onHint,
  disabled = false,
}: {
  puzzle: PuzzleView;
  initialDraft?: Partial<SubjectDraft> | null;
  onDraft?: (value: SubjectDraft) => Promise<void>;
  onSubmit: (
    value: SubjectDraft,
  ) => Promise<{ passed: boolean; message?: string }>;
  onHint: (value: SubjectDraft, tier: HintTier) => Promise<string>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<SubjectDraft>(() => ({
    ...empty,
    ...initialDraft,
    order:
      initialDraft?.order ??
      (puzzle.kind === "observatory"
        ? Array.from(
            { length: puzzle.slots },
            (_, i) => puzzle.fixed.find((f) => f.slot === i)?.planetId ?? "",
          )
        : []),
  }));
  const [piece, setPiece] = useState<"I" | "L">("I"),
    [rotation, setRotation] = useState(0),
    [working, setWorking] = useState(false),
    [completed, setCompleted] = useState(false),
    [message, setMessage] = useState("");
  const saveFailure = useDraftAutosave(draft, onDraft);
  const locked = disabled || working || completed;
  async function submit() {
    if (locked) return;
    setWorking(true);
    try {
      const result = await onSubmit(draft);
      setCompleted(result.passed);
      setMessage(
        result.message ?? (result.passed ? "ผ่านแล้ว!" : "ลองแก้ผังนี้ต่อได้"),
      );
    } catch {
      setMessage("เชื่อมต่อไม่สำเร็จ ผังเดิมยังอยู่ ลองส่งอีกครั้ง");
    } finally {
      setWorking(false);
    }
  }
  async function hint(tier: HintTier) {
    if (working) return;
    setWorking(true);
    try {
      setMessage(await onHint(draft, tier));
    } catch {
      setMessage("เปิดคำใบ้ไม่สำเร็จ ลองอีกครั้งได้");
    } finally {
      setWorking(false);
    }
  }
  function tile(r: number, c: number) {
    if (locked || puzzle.kind !== "pond") return;
    const exists = draft.tiles.find((t) => t.r === r && t.c === c);
    if (exists) {
      setDraft((d) => ({
        ...d,
        tiles: d.tiles.map((t) =>
          t === exists ? { ...t, rot: (t.rot + 1) % 4 } : t,
        ),
      }));
      return;
    }
    if (
      draft.tiles.filter((t) => t.kind === piece).length >= puzzle.tray[piece]
    ) {
      setMessage("ใช้ท่อชนิดนี้ครบแล้ว ยกชิ้นที่วางไว้เพื่อย้ายได้");
      return;
    }
    setDraft((d) => ({
      ...d,
      tiles: [...d.tiles, { r, c, kind: piece, rot: rotation }],
    }));
  }
  return (
    <section className={styles.puzzle} aria-label={titles[puzzle.kind]}>
      <h2>{titles[puzzle.kind]}</h2>
      <p>{guides[puzzle.kind]}</p>
      {puzzle.kind === "pond" && (
        <>
          <div className={styles.tools}>
            <button
              disabled={locked}
              aria-pressed={piece === "I"}
              onClick={() => setPiece("I")}
            >
              ท่อตรง{" "}
              {puzzle.tray.I - draft.tiles.filter((t) => t.kind === "I").length}
            </button>
            <button
              disabled={locked}
              aria-pressed={piece === "L"}
              onClick={() => setPiece("L")}
            >
              ท่อโค้ง{" "}
              {puzzle.tray.L - draft.tiles.filter((t) => t.kind === "L").length}
            </button>
            <button
              disabled={locked}
              onClick={() => setRotation((r) => (r + 1) % 4)}
            >
              หมุนชิ้นในถาด {rotation * 90}°
            </button>
          </div>
          <div
            className={styles.grid}
            style={{ gridTemplateColumns: `repeat(${puzzle.w},minmax(0,1fr))` }}
          >
            {Array.from({ length: puzzle.w * puzzle.h }, (_, i) => {
              const r = Math.floor(i / puzzle.w),
                c = i % puzzle.w,
                fixed = puzzle.fixed.find((f) => f.r === r && f.c === c),
                t = draft.tiles.find((t) => t.r === r && t.c === c);
              const sides =
                fixed?.sides ??
                (t
                  ? (t.kind === "I" ? [0, 2] : [0, 1]).map(
                      (d) => (d + t.rot) % 4,
                    )
                  : []);
              return (
                <div key={i} className={styles.pipe}>
                  <button
                    disabled={locked || !!fixed}
                    onClick={() => tile(r, c)}
                    aria-label={`แถว ${r + 1} ช่อง ${c + 1} ${fixed?.label ?? (t ? "หมุนท่อ" : "วางท่อ")}`}
                  >
                    <Pipe sides={sides} />
                    <span>{fixed?.label ?? (t ? "↻" : "＋")}</span>
                  </button>
                  {t && (
                    <button
                      className={styles.remove}
                      disabled={locked}
                      aria-label={`ยกท่อแถว ${r + 1} ช่อง ${c + 1}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          tiles: d.tiles.filter((x) => x !== t),
                        }))
                      }
                    >
                      ยกออก
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {puzzle.kind === "flower" && (
        <>
          <p className={styles.fact}>
            พืชใช้พลังงานแสง เปลี่ยนน้ำและคาร์บอนไดออกไซด์เป็นน้ำตาล
            และปล่อยออกซิเจน ดินและแร่ธาตุช่วยให้พืชเติบโต
            แต่ไม่ใช่อาหารที่พืชสร้าง
          </p>
          {puzzle.plots.map((plot) => (
            <fieldset key={plot.index}>
              <legend>{plot.plantLabel}</legend>
              <ul>
                {plot.observations.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {puzzle.factors.map((f) => {
                const current = draft.slots.find(
                  (s) => s.plot === plot.index && s.factorId === f.id,
                );
                return (
                  <label key={f.id}>
                    {f.label}
                    <select
                      disabled={locked}
                      aria-label={f.label + " " + plot.plantLabel}
                      value={current?.cardId ?? ""}
                      onChange={(e) => {
                        const cardId = e.target.value;
                        setDraft((d) => ({
                          ...d,
                          slots: [
                            ...d.slots.filter(
                              (s) =>
                                s.plot !== plot.index || s.factorId !== f.id,
                            ),
                            ...(cardId
                              ? [{ plot: plot.index, factorId: f.id, cardId }]
                              : []),
                          ],
                        }));
                      }}
                    >
                      <option value="">เลือกการ์ด</option>
                      {puzzle.cards.map((card) => (
                        <option
                          key={card.id}
                          value={card.id}
                          disabled={draft.slots.some(
                            (s) => s.cardId === card.id && s !== current,
                          )}
                        >
                          {card.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </>
      )}
      {puzzle.kind === "bridge" && (
        <>
          <div className={styles.fact}>
            จุดหมุน ▲ อยู่ที่ 0 · ซ้าย −{puzzle.maxPos} ถึง −1 · ขวา 1 ถึง{" "}
            {puzzle.maxPos}
            <br />
            ก้อนที่ล็อกไว้: น้ำหนัก {puzzle.fixed.value} ที่ตำแหน่ง{" "}
            {puzzle.fixed.pos}
            <br />
            แตะช่องแล้วเลือกตำแหน่ง
            น้ำหนักมากหรืออยู่ไกลจุดหมุนทำให้คานเอียงมากขึ้น
          </div>
          {puzzle.weights.map((w) => {
            const current = draft.placements.find((x) => x.weightId === w.id);
            return (
              <label key={w.id}>
                ก้อน {w.id.replace("w", "")} · น้ำหนัก {w.value}
                <select
                  disabled={locked}
                  aria-label={"ตำแหน่งก้อน " + w.id}
                  value={current?.pos ?? ""}
                  onChange={(e) => {
                    const pos = Number(e.target.value);
                    setDraft((d) => ({
                      ...d,
                      placements: [
                        ...d.placements.filter((x) => x.weightId !== w.id),
                        ...(pos ? [{ weightId: w.id, pos }] : []),
                      ],
                    }));
                  }}
                >
                  <option value="">เลือกตำแหน่ง</option>
                  {Array.from(
                    { length: puzzle.maxPos * 2 + 1 },
                    (_, i) => i - puzzle.maxPos,
                  )
                    .filter((p) => p !== 0)
                    .map((pos) => (
                      <option
                        key={pos}
                        value={pos}
                        disabled={
                          pos === puzzle.fixed.pos ||
                          draft.placements.some(
                            (x) => x.pos === pos && x.weightId !== w.id,
                          )
                        }
                      >
                        {pos < 0 ? "ซ้าย" : "ขวา"} {Math.abs(pos)}{" "}
                        ช่องจากจุดหมุน
                      </option>
                    ))}
                </select>
              </label>
            );
          })}
        </>
      )}
      {puzzle.kind === "observatory" && (
        <>
          <div className={styles.fact}>☀ ดวงอาทิตย์ → ใกล้ไปไกล</div>
          <ul>
            {puzzle.clues.map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
          </ul>
          {Array.from({ length: puzzle.slots }, (_, slot) => {
            const fixed = puzzle.fixed.find((x) => x.slot === slot);
            return (
              <label key={slot}>
                วงโคจร {slot + 1}
                {fixed ? " · วางไว้แล้ว" : ""}
                <select
                  disabled={locked || !!fixed}
                  aria-label={"วงโคจร " + (slot + 1)}
                  value={draft.order[slot] ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      order: Array.from({ length: puzzle.slots }, (_, i) =>
                        i === slot ? id : (d.order[i] ?? ""),
                      ),
                    }));
                  }}
                >
                  <option value="">เลือกดาว</option>
                  {puzzle.tray.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={draft.order.some(
                        (id, i) => id === p.id && i !== slot,
                      )}
                    >
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </>
      )}
      <div className={styles.tools}>
        {([1, 2, 3] as const).map((tier) => (
          <button key={tier} disabled={working} onClick={() => hint(tier)}>
            คำใบ้ {tier}
          </button>
        ))}
      </div>
      {saveFailure && <p role="alert">{saveFailure}</p>}
      <p className={styles.message} role="status">
        {message}
      </p>
      <button className={styles.submit} disabled={locked} onClick={submit}>
        {working ? "กำลังตรวจ…" : "ตรวจผังนี้"}
      </button>
    </section>
  );
}
