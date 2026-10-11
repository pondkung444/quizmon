import Link from "next/link";
import { loadProjectOverview } from "@/lib/farm/project-overview-server";
import { loadSchoolPets } from "@/lib/farm/school-server";
import ProjectQueueClient from "@/components/farm/ProjectQueueClient";
export default async function ProjectsPage() {
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
