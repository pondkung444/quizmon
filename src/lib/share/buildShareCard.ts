import type { Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName, type PetLine } from "@/lib/petLine";
import { pickShareMoment, SHARE_CARD_TEXT } from "@/lib/share/shareMoment";
import type { ShareCardInput } from "@/lib/share/renderShareCard";

// รวมข้อมูลจบรอบเป็น input ของการ์ด — null = ไม่มีปุ่ม (ไม่เข้าเงื่อนไข หรือภาพ/ชื่อไม่ครบ)
export function buildShareCard(input: {
  pet: {
    nickname: string | null;
    spritePrefix: string;
    eggNameTh: string;
    stage: number;
    subline: PetLine | null;
    personality: Personality | null;
  };
  currentImage: string | null;
  evolved: boolean;
  fromStage: number | null;
  toStage: number | null;
  toSubline: PetLine | null;
  correctInRound: number;
  questionCount: number;
}): ShareCardInput | null {
  const { pet, currentImage, evolved, fromStage, toStage, toSubline, correctInRound, questionCount } = input;
  const moment = pickShareMoment({ evolved, fromStage, toStage, correctInRound, questionCount });
  if (!moment) return null;

  try {
    const stage = moment === "perfect" ? pet.stage : (toStage as number);
    const line = moment === "evolve" ? toSubline : pet.subline;
    const imageAfter = moment === "perfect" ? currentImage : getPetImagePath(pet.spritePrefix, stage, line, null);
    if (!imageAfter) return null;
    return {
      moment,
      nickname: pet.nickname || getSpeciesName(pet.spritePrefix, stage, line, pet.personality, pet.eggNameTh),
      imageBefore: moment === "evolve" ? currentImage : null,
      imageAfter,
      stat: moment === "perfect" ? SHARE_CARD_TEXT.perfect(correctInRound) : SHARE_CARD_TEXT.stage(stage),
    };
  } catch (err) {
    // เช่น เข้าระยะ 3 แล้วอ่านสายไม่สำเร็จ: ซ่อนปุ่ม ไม่ให้จอจบรอบพัง
    console.error(err);
    return null;
  }
}
