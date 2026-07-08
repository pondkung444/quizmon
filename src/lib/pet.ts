export type PetStageInfo = {
  stage: number;
  name: string;
  emoji: string;
  minPoints: number;
};

// สายวิวัฒนาการเดียว เรียงจากแต้มน้อย -> แต้มมาก
export const PET_STAGES: PetStageInfo[] = [
  { stage: 1, name: "ไข่ลึกลับ", emoji: "🥚", minPoints: 0 },
  { stage: 2, name: "สไลม์น้อย", emoji: "🟢", minPoints: 20 },
  { stage: 3, name: "มังกรน้อย", emoji: "🐲", minPoints: 60 },
  { stage: 4, name: "มังกรหนุ่ม", emoji: "🐉", minPoints: 150 },
  { stage: 5, name: "มังกรเทพ", emoji: "🐉✨", minPoints: 300 },
];

export function getPetStage(points: number): PetStageInfo {
  let current = PET_STAGES[0];
  for (const stage of PET_STAGES) {
    if (points >= stage.minPoints) current = stage;
  }
  return current;
}

export function getNextStage(points: number): PetStageInfo | null {
  const current = getPetStage(points);
  const idx = PET_STAGES.findIndex((s) => s.stage === current.stage);
  return PET_STAGES[idx + 1] ?? null;
}

// สัดส่วนความคืบหน้า (0-1) ไปยังด่านถัดไป ใช้กับ progress bar
export function getProgressToNextStage(points: number): number {
  const current = getPetStage(points);
  const next = getNextStage(points);
  if (!next) return 1;
  const span = next.minPoints - current.minPoints;
  const progressed = points - current.minPoints;
  return Math.min(1, Math.max(0, progressed / span));
}
