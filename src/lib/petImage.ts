import type { Subline, Personality } from "@/lib/evolution";
import { artLane, type PetLine } from "@/lib/petLine";

const SUBLINE_FILE_NAME: Record<Subline, string> = {
  math: "math",
  science: "science",
  balanced: "balance", // ไฟล์สะกดไม่มี "d" ท้าย ตั้งใจแปลงตรงนี้จุดเดียว
};

export function getPetImagePath(
  spritePrefix: string,
  stage: number,
  subline: PetLine | null,
  personality: Personality | null
): string {
  if (stage === 1) return `/pets/${spritePrefix}_stage1_egg.png`;
  if (stage === 2) return `/pets/${spritePrefix}_stage2_baby.png`;

  if (stage === 3) {
    if (!subline) {
      throw new Error(`getPetImagePath: pet stage 3 ต้องมี subline แต่ได้ null (prefix=${spritePrefix})`);
    }
    return `/pets/${spritePrefix}_stage3_${SUBLINE_FILE_NAME[artLane(subline)]}.png`;
  }

  if (stage === 4) {
    if (!subline || !personality) {
      throw new Error(
        `getPetImagePath: pet stage 4 ต้องมี subline+personality แต่ได้ subline=${subline}, personality=${personality} (prefix=${spritePrefix})`
      );
    }
    return `/pets/${spritePrefix}_stage4_${SUBLINE_FILE_NAME[artLane(subline)]}_${personality}.png`;
  }

  throw new Error(`getPetImagePath: stage ไม่ถูกต้อง: ${stage}`);
}
