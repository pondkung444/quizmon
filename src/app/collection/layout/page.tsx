import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadFarmLayoutIfAvailable } from "@/lib/farm/layout-server";
import { loadProjectOverview } from "@/lib/farm/project-overview-server";
import { loadFarmPets } from "@/lib/farm/server";
import LayoutClient from "@/components/farm/LayoutClient";
export default async function LayoutPage() {
  if (!(await getUser())) redirect("/login");
  const tiles = await loadFarmLayoutIfAvailable();
  if (!tiles)
    return (
      <main className="p-4">
        <Link href="/collection">← กลับฟาร์ม</Link>
        <p>กำลังเตรียมระบบจัดผัง งานเดิมยังเล่นต่อได้</p>
      </main>
    );
  const [overview, pets] = await Promise.all([
    loadProjectOverview(),
    loadFarmPets(),
  ]);
  const ready = overview.projects
    .filter((p) => p.status === "ready" && p.rules_snapshot.place !== "school")
    .map((p) => ({
      id: p.id,
      kind: p.rules_snapshot.place,
      name: p.rules_snapshot.place,
    }));
  return (
    <main data-app-wide className="mx-auto max-w-4xl p-4 pb-24">
      <Link href="/collection" className="inline-flex min-h-11 items-center">
        ← กลับฟาร์ม
      </Link>
      <LayoutClient initialTiles={tiles} pets={pets} ready={ready} />
    </main>
  );
}
