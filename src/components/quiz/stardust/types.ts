import type { StardustElement } from "@/lib/stardust";
import type { Personality } from "@/lib/evolution";
import type { PetLine } from "@/lib/petLine";

// ข้อมูลน้องที่ page.tsx ส่งให้หน้า "ตามหาประกายดาว" — ค่าก่อนเริ่มรอบ (มาจาก select pets เดิม ไม่ query เพิ่ม)
export type StardustPetInfo = {
  element: StardustElement;
  name: string;
  stage: number;
  exp: number;
  cracksBefore: number;
  // ฉากเปิดของไข่: stage 1 และ exp === 0 (ไข่ใบนี้ยังไม่เคยได้ EXP — ไข่ใหม่เริ่มที่ exp 0 ดู eggs/actions.ts)
  showEggIntro: boolean;
  // คีย์ "ดูฉากเปิดแล้ว" ต่อไข่ต่อเครื่อง (localStorage qm:eggIntroSeen:<petId>)
  petId: string;
  // การ์ดแชร์: ชื่อจริงที่เด็กตั้ง (name มี fallback ของหน้าจอปนอยู่) + ข้อมูลหาภาพ/ชื่อชนิด
  nickname: string | null;
  spritePrefix: string | null;
  eggNameTh: string | null;
  subline: PetLine | null;
  personality: Personality | null;
};
