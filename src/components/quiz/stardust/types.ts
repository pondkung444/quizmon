import type { StardustElement } from "@/lib/stardust";

// ข้อมูลน้องที่ page.tsx ส่งให้หน้า "ตามหาประกายดาว" — ค่าก่อนเริ่มรอบ (มาจาก select pets เดิม ไม่ query เพิ่ม)
export type StardustPetInfo = {
  element: StardustElement;
  name: string;
  stage: number;
  exp: number;
  cracksBefore: number;
};
