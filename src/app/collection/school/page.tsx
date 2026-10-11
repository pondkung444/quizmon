import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadSchoolProject,loadSchoolPets,loadConfirmedSchoolLevel } from "@/lib/farm/school-server";
import SchoolClient from "@/components/farm/SchoolClient";

export default async function SchoolPage() {
  if(!await getUser()) redirect("/login");
  const [project,pets,level] = await Promise.all([loadSchoolProject(),loadSchoolPets(),loadConfirmedSchoolLevel()]);
  return <main data-app-wide className="mx-auto w-full max-w-xl p-4 pb-24 lg:max-w-[var(--app-frame-w)]">
    <Link href="/collection" className="inline-flex min-h-11 items-center text-sm text-gold-hi">← กลับฟาร์ม</Link>
    {project?.status==='placed'&&<Link className="my-3 flex min-h-11 items-center rounded border border-white/20 px-3" href="/collection/projects">คิวงาน · ทีมสร้าง · อัปเกรดโรงเรียน →</Link>}
    <SchoolClient level={level||1} initialProject={project} pets={pets} serverNow={new Date().toISOString()} />
  </main>;
}
