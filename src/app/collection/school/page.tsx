import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadSchoolProject,loadSchoolPets } from "@/lib/farm/school-server";
import SchoolClient from "@/components/farm/SchoolClient";

export default async function SchoolPage() {
  if(!await getUser()) redirect("/login");
  const [project,pets] = await Promise.all([loadSchoolProject(),loadSchoolPets()]);
  return <main data-app-wide className="mx-auto w-full max-w-xl p-4 pb-24 lg:max-w-[var(--app-frame-w)]">
    <Link href="/collection" className="inline-flex min-h-11 items-center text-sm text-gold-hi">← กลับฟาร์ม</Link>
    <SchoolClient initialProject={project} pets={pets} serverNow={new Date().toISOString()} />
  </main>;
}
