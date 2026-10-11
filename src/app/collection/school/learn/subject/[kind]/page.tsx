import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadSchoolPets } from "@/lib/farm/school-server";
import { SUBJECT_LESSONS, openSubjectLesson } from "@/lib/farm/lesson-server";
import type { PuzzleKind } from "@/lib/farm/puzzle-engine";
import SubjectLessonClient from "@/components/farm/SubjectLessonClient";
export default async function SubjectLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ pet?: string; replay?: string }>;
}) {
  if (!(await getUser())) redirect("/login");
  const { kind } = await params;
  if (!Object.hasOwn(SUBJECT_LESSONS, kind)) notFound();
  const { pet, replay } = await searchParams;
  const pets = await loadSchoolPets();
  const selected = pets.find((p) => p.id === pet) ?? pets[0];
  let session;
  let message = "";
  if (selected) {
    try {
      session = await openSubjectLesson(
        kind as PuzzleKind,
        selected.id,
        replay === "1",
      );
    } catch (error) {
      message = error instanceof Error ? error.message : "เปิดบทเรียนไม่สำเร็จ";
    }
  } else message = "เลี้ยง Qmon ให้ฟักเป็นระยะ 2 แล้วมาเรียนกับคู่หู";
  return (
    <main data-app-wide style={{ padding: 12 }}>
      <Link href="/collection/school/learn">← สมุดแบบสร้าง</Link>
      <h1>{SUBJECT_LESSONS[kind as PuzzleKind].name}</h1>
      <p>เรียนแบบมีคำแนะนำ · ไม่จับเวลา · ผิดแล้วแก้ผังเดิมต่อ</p>
      <form>
        <label>
          คู่หูที่มาเรียน{" "}
          <select name="pet" defaultValue={selected?.id}>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · ระยะ {p.stage}
              </option>
            ))}
          </select>
        </label>
        <button>เลือกคู่หู</button>
      </form>
      {session ? (
        session.completed ? (
          <div>
            <p>ผ่านบทนี้แล้ว แบบเดิมยังอยู่ในสมุด</p>
            <Link href={`?pet=${selected?.id}&replay=1`}>
              เรียนทบทวนด้วยผังใหม่ · ไม่รับรางวัลซ้ำ
            </Link>
          </div>
        ) : (
          <SubjectLessonClient session={session} />
        )
      ) : (
        <p role="status">{message}</p>
      )}
    </main>
  );
}
