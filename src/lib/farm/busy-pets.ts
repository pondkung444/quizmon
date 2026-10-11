import type { SupabaseClient } from "@supabase/supabase-js";
export async function farmBusyPets(
  db: SupabaseClient,
  userId: string,
  now = Date.now(),
) {
  const [school, gardens, projects] = await Promise.all([
    db
      .from("farm_school_projects")
      .select("leader_id,status,ready_at")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("farm_garden_projects")
      .select("leader_id,status,ready_at")
      .eq("user_id", userId),
    db.from("farm_projects").select("id,status,ready_at").eq("user_id", userId),
  ]);
  // Older installations do not have the additive project tables yet.
  if (
    school.error ||
    gardens.error ||
    (projects.error &&
      projects.error.code !== "42P01" &&
      projects.error.code !== "PGRST205")
  )
    throw Error("โหลดสถานะงานของ Qmon ไม่สำเร็จ");
  const active = (p: { status: string; ready_at: string | null }) =>
    p.status === "building" ||
    p.status === "puzzle" ||
    (p.status === "finishing" && !!p.ready_at && Date.parse(p.ready_at) > now);
  const legacy = new Set<string>();
  for (const p of [school.data, ...(gardens.data ?? [])])
    if (p && p.leader_id && active(p)) legacy.add(p.leader_id);
  const ids = (projects.data ?? []).filter(active).map((p) => p.id);
  const teams = ids.length
    ? await db
        .from("farm_project_assignments")
        .select("pet_id,project_id")
        .in("project_id", ids)
    : { data: [], error: null };
  if (teams.error) throw Error("โหลดทีมงานของ Qmon ไม่สำเร็จ");
  const projectByPet = Object.fromEntries(
    (teams.data ?? []).map((a) => [a.pet_id, a.project_id]),
  );
  return {
    legacy,
    projectByPet,
    all: new Set([...legacy, ...Object.keys(projectByPet)]),
  };
}
