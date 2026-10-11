import Link from "next/link";
import { loadProjectOverview } from "@/lib/farm/project-overview-server";
import {farmProjectSchemaAvailable} from "@/lib/farm/school-server";
import {getUser} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import { loadSchoolPets } from "@/lib/farm/school-server";
import ProjectQueueClient from "@/components/farm/ProjectQueueClient";
export default async function ProjectsPage() {
  if(!await getUser())redirect("/login");
  if(!await farmProjectSchemaAvailable())return <main className="mx-auto max-w-xl p-4"><Link href="/collection/school">← กลับโรงเรียน</Link><p>กำลังเตรียมระบบโครงการใหม่ งานโรงเรียนและสวนเดิมยังเล่นต่อได้</p></main>;
  const [overview, pets] = await Promise.all([
    loadProjectOverview(),
    loadSchoolPets(),
  ]);
  return (
    <main data-app-wide className="mx-auto max-w-xl p-4 pb-24">
      <Link
        className="inline-flex min-h-11 items-center"
        href="/collection/school"
      >
        ← กลับโรงเรียน
      </Link>
      <ProjectQueueClient overview={overview} pets={pets} />
    </main>
  );
}
