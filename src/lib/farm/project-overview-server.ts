import "server-only";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FarmProject } from "./projects-server";
import {
  projectDisplayState,
  schoolLevel,
  projectTeamAvailability,
  type ProjectAssignment,
} from "./project-overview";
export async function loadProjectOverview() {
  const user = await getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  const db = createAdminClient();
  const results = await Promise.all([
    db
      .from("farm_projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at"),
    db
      .from("farm_school_projects")
      .select("status,tile_x,tile_y")
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("farm_garden_projects")
      .select("id,status,ready_at,leader_id,tile_x,tile_y")
      .eq("user_id", user.id),
    db.from("farm_catalogue").select("id,enabled"),
  ]);
  if (results.some((result) => result.error))
    throw new Error("โหลดคิวโครงการไม่สำเร็จ");
  const [projects, school, gardens, catalogue] = results;
  const rows = (projects.data ?? []) as FarmProject[];
  // Assignments have no user column. Scope through the verified owner's project IDs.
  const teams = rows.length
    ? await db
        .from("farm_project_assignments")
        .select("project_id,pet_id,role")
        .in(
          "project_id",
          rows.map((p) => p.id),
        )
    : { data: [], error: null };
  if (teams.error) throw new Error("โหลดทีมโครงการไม่สำเร็จ");
  const assignments = (teams.data ?? []) as ProjectAssignment[];
  const now = Date.now();
  return {
    projects: rows.map((p) => projectDisplayState(p, now)),
    assignments,
    school: school.data,
    gardens: gardens.data ?? [],
    catalogue: catalogue.data ?? [],
    level: schoolLevel(school.data?.status === "placed", rows),
    busyProjects: projectTeamAvailability(rows, assignments, now),
    serverNow: new Date(now).toISOString(),
  };
}
