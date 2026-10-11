"use client";
import { useRef, useState } from "react";
import ProjectQueueClient from "./ProjectQueueClient";
import { FARM_CATALOGUE } from "@/lib/farm/catalogue";
import type { FarmProject } from "@/lib/farm/projects-server";
import type { loadProjectOverview } from "@/lib/farm/project-overview-server";
import type { projectCommand } from "@/app/collection/projects/actions";
import type { SchoolPet } from "@/lib/farm/school";
const pets: SchoolPet[] = Array.from({ length: 4 }, (_, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  name: ["หัวหน้าฟ้า", "ผู้ช่วยทอง", "ผู้ช่วยเขียว", "คู่หูติด Adventure"][i],
  stage: i === 0 ? 4 : 2,
  busy: i === 3,
  busyOther: i === 3,
  imagePath: "/pets/egg3_stage4_science_A.png",
}));
function fixture(): Awaited<ReturnType<typeof loadProjectOverview>> {
  const definition = FARM_CATALOGUE.find((c) => c.id === "school-3")!;
  const project: FarmProject = {
    id: "00000000-0000-4000-8000-000000000010",
    user_id: "synthetic",
    catalogue_id: definition.id,
    rules_snapshot: {
      ...definition,
      catalogueVersion: 1,
      helperPercent: 10,
      penaltyPercent: 20,
      areaCap: 24,
      schoolCapacity: [
        { jobs: 0, helpers: 0 },
        { jobs: 1, helpers: 0 },
        { jobs: 2, helpers: 1 },
        { jobs: 2, helpers: 2 },
        { jobs: 3, helpers: 3 },
      ],
    },
    status: "building",
    checkpoint: 0,
    ready_at: "2030-01-01T00:00:00Z",
    remaining_seconds: 43200,
    round_deadline: null,
    failures: 0,
    penalty_applied: false,
    tile_x: null,
    tile_y: null,
    helper_count: 0,
  };
  return {
    projects: [project],
    assignments: [
      { project_id: project.id, pet_id: pets[0].id, role: "leader" },
    ],
    school: { status: "placed", tile_x: 1, tile_y: 1 },
    gardens: [],
    catalogue: [{ id: "school-3", enabled: true }],
    level: 2,
    busyProjects: { [pets[0].id]: project.id },
    serverNow: new Date().toISOString(),
  };
}
export default function ProjectQueuePreview() {
  const [overview] = useState(fixture),
    [events, setEvents] = useState<string[]>([]),
    current = useRef(overview.projects[0]);
  const command: typeof projectCommand = async (operation, input) => {
    if (input.projectId !== current.current.id)
      throw Error("โครงการจำลองไม่ตรง");
    if (operation === "team" || operation === "resume") {
      if (input.leaderId !== pets[0].id)
        throw Error("หัวหน้าจำลองต้องระยะ 3 ขึ้นไป");
      if ((input.helperIds ?? []).length > 1) throw Error("ผู้ช่วยเกินจำนวน");
      if (input.helperIds?.includes(pets[3].id))
        throw Error("คู่หูนี้ติด Adventure");
      current.current = {
        ...current.current,
        status: current.current.resume_status ?? current.current.status,
        resume_status: null,
        helper_count: input.helperIds?.length ?? 0,
      };
    } else if (operation === "pause")
      current.current = {
        ...current.current,
        status: "paused",
        resume_status: "building",
        ready_at: null,
      };
    else throw Error("ตัวอย่างนี้ตรวจเฉพาะการจัดทีม");
    setEvents((rows) => [
      ...rows,
      operation + ":" + current.current.helper_count,
    ]);
    return current.current;
  };
  return (
    <>
      <ProjectQueueClient overview={overview} pets={pets} command={command} />
      <p data-team-events role="status">
        {events.join(" | ")}
      </p>
    </>
  );
}
