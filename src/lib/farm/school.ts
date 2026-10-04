export type SchoolStatus = "draft" | "building" | "puzzle" | "finishing" | "paused" | "ready" | "placed";
export type SchoolProject = {
  status: SchoolStatus; leader_id: string | null; resume_status: SchoolStatus | null;
  ready_at: string | null; remaining_seconds: number; round_deadline: string | null;
  failures: number; penalty_applied: boolean; tile_x: number | null; tile_y: number | null;
};
export type SchoolPet = { id: string; name: string; imagePath: string; stage: number; busy: boolean };
export type SchoolResult = { project?: SchoolProject; serverNow?: string; message?: string; passed?: boolean; error?: string };
export const SCHOOL_LABELS: Record<SchoolStatus,string> = {
  draft:"สร้างโรงเรียน", building:"กำลังเตรียมพื้น", puzzle:"พร้อมให้ช่วยจัดพื้น",
  finishing:"กำลังเก็บงาน", paused:"งานพักอยู่", ready:"เลือกที่วางโรงเรียน", placed:"โรงเรียน ระดับ 1",
};
export function schoolDisplayState(project: SchoolProject | null, now = Date.now()): SchoolProject | null {
  if (!project || !project.ready_at || Date.parse(project.ready_at)>now) return project;
  if (project.status === "building") return {...project,status:"puzzle",ready_at:null};
  if (project.status === "finishing") return {...project,status:"ready",ready_at:null,leader_id:null};
  return project;
}
