/**
 * ชุดเนื้อหาที่ปอนด์แก้ได้โดยไม่ต้องแตะตรรกะ
 * ค่าในไฟล์นี้เป็น "ร่างเริ่มต้น" เพื่อให้ระบบรันได้ ต้องให้ปอนด์ตรวจความถูกต้องทางวิชาการและปรับให้ตรงกับบทเรียนค้นพบแบบจริง
 */

/* ---------- บ่อน้ำ: วัฏจักรน้ำ ---------- */
export const POND_CONTENT = {
  sourceLabel: 'ทะเล',
  sinkLabel: 'ทะเล',
  /** เรียงตามลำดับวัฏจักร ต้องมี 4 รายการพอดี (ตรงกับจำนวนสถานีในตัวสร้างผัง) */
  stations: [
    { id: 'evaporation', label: 'ระเหย' },
    { id: 'condensation', label: 'ควบแน่น' },
    { id: 'precipitation', label: 'ฝนตก' },
    { id: 'collection', label: 'ไหลสะสม' },
  ],
} as const;

/* ---------- สวนดอกไม้: ความต้องการของพืช ---------- */
export type Level = string;
export interface FactorDef {
  id: string;
  label: string;
  levels: [Level, Level];
  levelLabels: [string, string];
}
export interface PlantDef {
  id: string;
  label: string;
  /** factorId -> ระดับที่พืชต้องการ (ต้องเป็นหนึ่งใน levels ของ factor นั้น) */
  needs: Record<string, Level>;
}

export const FLOWER_CONTENT: {
  factors: FactorDef[];
  plants: PlantDef[];
  /** ปัจจัยหลอก: วางลงช่องใดไม่ได้เลย ใช้สอนว่าอะไรไม่เกี่ยวกับความต้องการของพืช */
  distractors: { id: string; label: string }[];
} = {
  factors: [
    { id: 'light', label: 'แสง', levels: ['high', 'low'], levelLabels: ['แสงมาก', 'แสงน้อย'] },
    { id: 'water', label: 'น้ำ', levels: ['high', 'low'], levelLabels: ['น้ำมาก', 'น้ำน้อย'] },
    { id: 'soil', label: 'ดิน', levels: ['rich', 'sandy'], levelLabels: ['ดินอุดม', 'ดินทราย'] },
  ],
  // โปรไฟล์ความต้องการของแต่ละต้นต้องไม่ซ้ำกัน (ตัวทดสอบตรวจให้)
  plants: [
    { id: 'cactus', label: 'กระบองเพชร', needs: { light: 'high', water: 'low', soil: 'sandy' } },
    { id: 'fern', label: 'เฟิร์น', needs: { light: 'low', water: 'high', soil: 'rich' } },
    { id: 'lotus', label: 'บัวหลวง', needs: { light: 'high', water: 'high', soil: 'rich' } },
    { id: 'snakeplant', label: 'ลิ้นมังกร', needs: { light: 'low', water: 'low', soil: 'sandy' } },
    { id: 'sunflower', label: 'ทานตะวัน', needs: { light: 'high', water: 'low', soil: 'rich' } },
    { id: 'moss', label: 'มอส', needs: { light: 'low', water: 'high', soil: 'sandy' } },
  ],
  distractors: [
    { id: 'wind', label: 'ลมแรง' },
    { id: 'music', label: 'เสียงเพลง' },
    { id: 'dust', label: 'ฝุ่นละออง' },
    { id: 'night', label: 'กลางคืนตลอดวัน' },
  ],
};

/* ---------- หอดูดาว: ดวงดาวเคราะห์ ---------- */
export interface PlanetDef {
  id: string;
  label: string;
  type: 'rocky' | 'gas' | 'ice';
  diameterKm: number;
  /** มีระบบวงแหวนที่เห็นเด่นชัดจากกล้องทั่วไป */
  bigRings: boolean;
}

/** เรียงตามระยะจากดวงอาทิตย์จริง ใกล้ -> ไกล (ลำดับนี้คือเฉลยของพัซเซิล) */
export const PLANETS: readonly PlanetDef[] = [
  { id: 'mercury', label: 'พุธ', type: 'rocky', diameterKm: 4879, bigRings: false },
  { id: 'venus', label: 'ศุกร์', type: 'rocky', diameterKm: 12104, bigRings: false },
  { id: 'earth', label: 'โลก', type: 'rocky', diameterKm: 12742, bigRings: false },
  { id: 'mars', label: 'อังคาร', type: 'rocky', diameterKm: 6779, bigRings: false },
  { id: 'jupiter', label: 'พฤหัสบดี', type: 'gas', diameterKm: 139820, bigRings: false },
  { id: 'saturn', label: 'เสาร์', type: 'gas', diameterKm: 116460, bigRings: true },
  { id: 'uranus', label: 'ยูเรนัส', type: 'ice', diameterKm: 50724, bigRings: false },
  { id: 'neptune', label: 'เนปจูน', type: 'ice', diameterKm: 49244, bigRings: false },
];
