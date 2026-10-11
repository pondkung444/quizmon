"use client";
import { useRef, useState } from "react";
import FloorPuzzle from "./FloorPuzzle";
import GardenPathPuzzle from "./GardenPathPuzzle";
import SubjectPuzzle, { type SubjectDraft } from "./SubjectPuzzle";
import {
  beginProjectPuzzle,
  persistProjectDraft,
  answerProjectPuzzle,
  projectHint,
} from "@/app/collection/projects/actions";
import type { SchoolPet } from "@/lib/farm/school";
import type { FarmProject } from "@/lib/farm/projects-server";
import type { FloorPlacement } from "@/lib/farm/floor-puzzle";
import type { GardenPlacement } from "@/lib/farm/garden-path";
import { validateGardenPath } from "@/lib/farm/garden-path";
import type { HintTier } from "@/lib/farm/puzzles/core";
type Session = Awaited<ReturnType<typeof beginProjectPuzzle>>;
export default function ProjectPuzzleClient({
  session,
  pet,
  onChanged,
  onClose,
}: {
  session: Session;
  pet: SchoolPet;
  onChanged: (p: FarmProject) => void;
  onClose: () => void;
}) {
  const [project, setProject] = useState(session.project),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [hint, setHint] = useState(""),
    [passed, setPassed] = useState(false);
  const revision = useRef(session.revision),
    queue = useRef(Promise.resolve()),
    conflict = useRef(false),
    complete = useRef(false),
    draft = useRef<unknown>(session.draft ?? { layout: [] });
  const pending = useRef<{ key: string; id: string } | null>(null);
  async function save(value: unknown) {
    draft.current = value;
    if (complete.current) return;
    if (conflict.current)
      throw Error("มีการแก้ผังจากอีกหน้า กรุณาโหลดสถานะใหม่");
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (complete.current) return;
        if (conflict.current)
          throw Error("มีการแก้ผังจากอีกหน้า กรุณาโหลดสถานะใหม่");
        const r = await persistProjectDraft(
          project.id,
          session.sessionId,
          revision.current,
          value,
        );
        if (!r.saved) {
          conflict.current = true;
          throw Error("มีการแก้ผังจากอีกหน้า กรุณาโหลดสถานะใหม่");
        }
        revision.current = r.revision;
      });
    await queue.current;
  }
  async function submit(value: unknown) {
    setBusy(true);
    try {
      if (conflict.current)
        throw Error("มีการแก้ผังจากอีกหน้า กรุณาโหลดสถานะใหม่");
      await queue.current;
      if (!project.round_deadline)
        throw Error("เริ่มรอบใหม่เพื่อแก้ผังเดิมต่อ");
      const key = project.round_deadline + JSON.stringify(value);
      if (!pending.current || pending.current.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      const deadline = project.round_deadline,
        request = pending.current.id;
      let result: Awaited<ReturnType<typeof answerProjectPuzzle>> | undefined;
      queue.current = queue.current.then(async () => {
        result = await answerProjectPuzzle(
          project.id,
          session.sessionId,
          deadline,
          request,
          value,
        );
        if (typeof result.revision === "number")
          revision.current = Math.max(revision.current, result.revision);
        complete.current = result.passed;
      });
      await queue.current;
      if (!result) throw Error("ตรวจคำตอบไม่สำเร็จ");
      const r: Awaited<ReturnType<typeof answerProjectPuzzle>> = result;
      if (typeof r.revision === "number")
        revision.current = Math.max(revision.current, r.revision);
      pending.current = null;
      complete.current = r.passed;
      setPassed(r.passed);
      setProject(r.project);
      onChanged(r.project);
      const text = r.passed
        ? "ผ่านจุดช่วยแล้ว · ทีมกำลังทำงานช่วงถัดไป"
        : r.project.round_deadline
          ? "ยังแก้ผังเดิมต่อได้"
          : "หมดรอบแล้ว · เริ่มรอบใหม่เพื่อแก้ผังเดิมต่อ";
      setMessage(text);
      return { passed: r.passed, message: text };
    } catch (error) {
      queue.current = queue.current.catch(() => {});
      throw error;
    } finally {
      setBusy(false);
    }
  }
  async function showHint(tier: HintTier) {
    setBusy(true);
    try {
      setHint(
        await projectHint(project.id, session.sessionId, draft.current, tier),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "เปิดคำใบ้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function restart() {
    setBusy(true);
    try {
      const next = await beginProjectPuzzle(project.id);
      setProject(next.project);
      onChanged(next.project);
      setMessage("เริ่มรอบใหม่ · แก้ผังเดิมต่อได้");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "เริ่มรอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  const board = session.puzzle;
  const layout =
    (session.draft as { layout?: FloorPlacement[] } | null)?.layout ?? [];
  return (
    <section className="space-y-3 rounded-xl border border-white/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>จุดช่วย {project.checkpoint + 1}</strong>
        <button className="min-h-11" onClick={onClose}>
          กลับคิว · เก็บผังไว้
        </button>
      </div>
      <p>
        เวลาต่อรอบ {project.rules_snapshot.puzzleSeconds} วินาที ·
        ปิดหน้านี้แล้วเวลายังเดินต่อ
      </p>
      {project.round_deadline && (
        <p>
          รอบนี้ถึง{" "}
          {new Date(project.round_deadline).toLocaleTimeString("th-TH")}
        </p>
      )}
      {!project.round_deadline && !passed && (
        <button
          disabled={busy}
          onClick={restart}
          className="min-h-11 rounded bg-white/10 px-3"
        >
          เริ่มรอบใหม่
        </button>
      )}
      {board.kind === "construction-floor" ? (
        <FloorPuzzle
          fixed={board.fixed}
          initialDraft={layout}
          practice={false}
          busy={busy || passed || !project.round_deadline}
          feedback={message}
          onDraft={(layout) => save({ layout })}
          onSubmit={(layout) => {
            void submit({ layout }).catch((e) =>
              setMessage(e instanceof Error ? e.message : "ตรวจงานไม่สำเร็จ"),
            );
          }}
        />
      ) : board.kind === "construction-path" ? (
        <GardenPathPuzzle
          embedded
          pet={pet}
          boardConfig={board.board}
          initialDraft={layout as GardenPlacement[]}
          onDraft={(layout) => save({ layout })}
          onCheck={async (layout) => {
            try {
              const result = await submit({ layout });
              const path = validateGardenPath(layout, board.board);
              return {
                valid: result.passed,
                message: result.message,
                path: path.path,
              };
            } catch (e) {
              return {
                error: e instanceof Error ? e.message : "ตรวจงานไม่สำเร็จ",
              };
            }
          }}
          onBuilt={onClose}
        />
      ) : (
        <SubjectPuzzle
          puzzle={board}
          initialDraft={session.draft as Partial<SubjectDraft>}
          onDraft={save}
          onSubmit={submit}
          onHint={(value, tier) =>
            projectHint(project.id, session.sessionId, value, tier)
          }
          disabled={busy || !project.round_deadline}
        />
      )}
      {(board.kind === "construction-floor" ||
        board.kind === "construction-path") && (
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3] as const).map((tier) => (
            <button
              className="min-h-11 rounded bg-white/10 px-3"
              disabled={busy}
              key={tier}
              onClick={() => showHint(tier)}
            >
              คำใบ้ {tier}
            </button>
          ))}
        </div>
      )}
      {hint && <p aria-live="polite">{hint}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
