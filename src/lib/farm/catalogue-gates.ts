import type { ProjectDefinition, FarmPlace } from "./catalogue";
export type CatalogueContext = {
  level: number;
  blueprints: readonly string[];
  placed: Partial<Record<FarmPlace, number>>;
  reserved: Partial<Record<FarmPlace, number>>;
  activeJobs: number;
  jobLimit: number;
  coins: number;
  leaderStages: readonly number[];
};
export function catalogueGate(
  def: ProjectDefinition,
  context: CatalogueContext,
) {
  const reasons: string[] = [];
  if (context.level < def.schoolLevel)
    reasons.push(`โรงเรียนระดับ ${def.schoolLevel}`);
  if (def.blueprint && !context.blueprints.includes(def.blueprint))
    reasons.push("เรียนเพื่อค้นพบแบบสร้างก่อน");
  const names = {
    school: "โรงเรียน",
    garden: "สวนพักผ่อน",
    pond: "บ่อน้ำ",
    flower: "สวนดอกไม้",
    bridge: "สะพาน",
    observatory: "หอดูดาว",
  };
  for (const [kind, n] of Object.entries(def.prerequisite))
    if ((context.placed[kind as FarmPlace] ?? 0) < n!)
      reasons.push(`วาง${names[kind as FarmPlace]} ${n} แห่ง`);
  if (
    !context.leaderStages.some(
      (stage) => stage >= def.leaderStage && stage <= 4,
    )
  )
    reasons.push(`มี Qmon ระยะ ${def.leaderStage} ขึ้นไปพร้อมคุมงาน`);
  if ((context.reserved[def.place] ?? 0) >= def.limit && def.place !== "school")
    reasons.push(`ครบเพดาน ${def.limit} แห่งแล้ว`);
  if (context.activeJobs >= context.jobLimit) reasons.push("มีช่องงานว่าง");
  if (context.coins < def.price)
    reasons.push(`เก็บอีก ${def.price - context.coins} เหรียญ`);
  return { ready: reasons.length === 0, reasons };
}
export const PLACE_ART = {
  pond: "/farm/qmon-pond-v1.png",
  flower: "/farm/qmon-flower-v1.png",
} as const;
