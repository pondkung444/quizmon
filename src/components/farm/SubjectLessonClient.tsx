"use client";
import { useRef } from "react";
import SubjectPuzzle from "./SubjectPuzzle";
import {
  lessonAnswer,
  lessonHint,
} from "@/app/collection/school/learn/subject/actions";
import type { openSubjectLesson } from "@/lib/farm/lesson-server";
export default function SubjectLessonClient({
  session,
}: {
  session: Awaited<ReturnType<typeof openSubjectLesson>>;
}) {
  const revision = useRef(session.revision),
    queue = useRef(Promise.resolve()),
    completed = useRef(false),
    conflict = useRef(false);
  async function save(draft: unknown) {
    if (completed.current) return;
    if (conflict.current)
      throw new Error("ผังถูกแก้จากอีกหน้า กรุณาโหลดใหม่ก่อนแก้ต่อ");
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        const r = await lessonAnswer(
          session.sessionId,
          revision.current,
          draft,
          false,
        );
        revision.current = r.revision;
        if (!r.saved) {
          conflict.current = true;
          throw new Error("ผังถูกแก้จากอีกหน้าหนึ่ง กรุณาโหลดใหม่");
        }
      });
    await queue.current;
  }
  return (
    <SubjectPuzzle
      key={session.sessionId}
      puzzle={session.puzzle}
      initialDraft={session.draft}
      onDraft={save}
      onSubmit={async (draft) => {
        if (conflict.current)
          throw new Error("ผังถูกแก้จากอีกหน้า กรุณาโหลดใหม่");
        await queue.current;
        const r = await lessonAnswer(
          session.sessionId,
          revision.current,
          draft,
          true,
        );
        revision.current = r.revision;
        completed.current = r.passed;
        if (!r.saved && !r.passed) conflict.current = true;
        return {
          passed: r.passed,
          message: r.passed
            ? r.created
              ? "ค้นพบแบบแล้ว! เก็บในสมุดของเราเรียบร้อย"
              : "ทบทวนผ่านแล้ว · ไม่รับรางวัลซ้ำ"
            : r.saved
              ? "แก้ผังเดิมต่อได้ ไม่จับเวลา"
              : "มีการแก้ผังจากอีกหน้า กรุณาโหลดสถานะใหม่",
        };
      }}
      onHint={(draft, tier) => lessonHint(session.sessionId, draft, tier)}
    />
  );
}
