import Link from "next/link";
import { randomInt, randomUUID } from "node:crypto";
import { redirect, notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadSchoolProject, loadSchoolPets } from "@/lib/farm/school-server";
import {
  generateConstruction,
  publicConstruction,
  validateConstruction,
  hintConstruction,
} from "@/lib/farm/construction-puzzles";
import type { HintTier } from "@/lib/farm/puzzles/core";
import ConstructionPreview from "@/components/farm/ConstructionPreview";
export default async function PracticePage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { kind } = await params;
  if (kind !== "construction-floor" && kind !== "construction-path") notFound();
  const [school, pets] = await Promise.all([
    loadSchoolProject(),
    loadSchoolPets(),
  ]);
  if (school?.status !== "placed" || !pets[0])
    return (
      <main className="p-4">
        <Link href="/collection">← ฟาร์ม</Link>
        <p>วางโรงเรียนและมี Qmon ที่ฟักแล้วเพื่อมาเล่นทบทวน</p>
      </main>
    );
  const owner = user.id,
    board = generateConstruction(kind, randomInt(0, 0x7fffffff));
  async function submit(draft: unknown) {
    "use server";
    if ((await getUser())?.id !== owner)
      throw Error("ต้องเข้าสู่ระบบด้วยเจ้าของรอบนี้");
    const result = validateConstruction(board, draft);
    return {
      passed: result.ok,
      message: result.ok
        ? "ผ่านรอบทบทวน · ไม่มีเหรียญ EXP หรือความคืบหน้างานเพิ่ม"
        : result.message,
    };
  }
  async function hint(draft: unknown, tier: HintTier) {
    "use server";
    if ((await getUser())?.id !== owner)
      throw Error("ต้องเข้าสู่ระบบด้วยเจ้าของรอบนี้");
    if (![1, 2, 3].includes(tier)) throw Error("เลือกคำใบ้ให้ถูกต้อง");
    return hintConstruction(board, draft, tier);
  }
  return (
    <main data-app-wide className="mx-auto max-w-xl space-y-3 p-3 pb-24">
      <Link href="/collection/places/main-school">← ผลงานโรงเรียน</Link>
      <h1 className="text-xl font-bold">
        {kind === "construction-floor" ? "ทบทวนปูกระเบื้อง" : "ทบทวนต่อทาง"}
      </h1>
      <p>ไม่จับเวลา · ไม่รับเหรียญหรือ EXP · ไม่เปลี่ยนงานก่อสร้าง</p>
      <ConstructionPreview
        key={randomUUID()}
        puzzle={publicConstruction(board)}
        submit={submit}
        hint={hint}
        pet={pets[0]}
      />
      <Link
        className="inline-flex min-h-11 items-center"
        href={"/collection/practice/" + kind + "?round=" + randomUUID()}
      >
        เริ่มผังทบทวนใหม่ →
      </Link>
    </main>
  );
}
