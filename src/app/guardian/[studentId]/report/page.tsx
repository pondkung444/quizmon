import { createClient } from "@/lib/supabase/server";
import ChapterCompare from "./ChapterCompare";
import type { CategoryRow, CurriculumChapter } from "../overview/shared";

export const dynamic = "force-dynamic";

// หน้า "รายงาน" — เริ่มจากเทียบบท (ย้ายมาจาก Overview) แต่ตั้งใจให้เป็นที่รวมรายงานเชิงลึกที่จะเพิ่มทีหลัง:
// ต่อ section ใหม่เป็น <section> การ์ดถัดไปใน list ด้านล่างได้เลย ไม่ต้องแตะ Overview
export default async function GuardianReportPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  // access + ความเป็นเจ้าของ studentId เช็คแล้วที่ layout.tsx ของ [studentId] — เชื่อ params ได้เลย
  const { studentId } = await params;
  const supabase = await createClient();

  const [categoriesRes, chaptersRes] = await Promise.all([
    supabase.rpc("guardian_get_categories", { p_student_id: studentId }),
    supabase.rpc("guardian_get_available_chapters", { p_student_id: studentId }),
  ]);

  const categories = (categoriesRes.data ?? []) as CategoryRow[];
  const curriculum = (chaptersRes.data ?? []) as CurriculumChapter[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-text">รายงาน</h1>
        <p className="text-xs text-text3">รายละเอียดเชิงลึกของการเรียนรู้</p>
      </div>
      <section className="gd-card p-4">
        <ChapterCompare categories={categories} curriculum={curriculum} />
      </section>
    </div>
  );
}
