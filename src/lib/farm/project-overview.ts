import type { FarmProject } from "./projects-server";
import { SCHOOL_CAPACITY } from "./catalogue.ts";
export type ProjectAssignment = {
  project_id: string;
  pet_id: string;
  role: "leader" | "helper";
};
export function projectDisplayState(
  project: FarmProject,
  now = Date.now(),
): FarmProject {
  if (!project.ready_at || Date.parse(project.ready_at) > now) return project;
  if (project.status === "building")
    return { ...project, status: "puzzle", ready_at: null };
  if (project.status === "finishing")
    return { ...project, status: "ready", ready_at: null };
  return project;
}
export function schoolLevel(
  legacyPlaced: boolean,
  projects: readonly FarmProject[],
): number {
  return projects.reduce(
    (level, p) =>
      p.status === "placed" && p.rules_snapshot.place === "school"
        ? Math.max(level, p.rules_snapshot.targetLevel ?? 0)
        : level,
    legacyPlaced ? 1 : 0,
  );
}
export function projectOccupiesSlot(project: FarmProject) {
  return project.status !== "placed";
}
export function projectUsesPets(project: FarmProject, now = Date.now()) {
  const status = projectDisplayState(project, now).status;
  return status === "building" || status === "puzzle" || status === "finishing";
}
export function projectTeamAvailability(
  projects: readonly FarmProject[],
  assignments: readonly ProjectAssignment[],
  now = Date.now(),
) {
  const active = new Set(
    projects.filter((p) => projectUsesPets(p, now)).map((p) => p.id),
  );
  return Object.fromEntries(
    assignments
      .filter((a) => active.has(a.project_id))
      .map((a) => [a.pet_id, a.project_id]),
  );
}
export function queueCapacity(level: number) {
  return SCHOOL_CAPACITY[Math.max(0, Math.min(4, level))];
}
