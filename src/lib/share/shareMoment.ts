// กติกาล้วนของปุ่มแชร์ (pure — test ได้ใน node:test) ตัววาดอยู่ที่ renderShareCard.ts

export const SHARE_MOMENTS = ["hatch", "evolve", "perfect"] as const;
export type ShareMoment = (typeof SHARE_MOMENTS)[number];

// ห้ามใส่ friend_code หรือข้อมูลที่ระบุตัวเด็กลงลิงก์นี้
export const SHARE_ORIGIN = "https://quizmon.xyz";

export function shareSource(moment: ShareMoment): string {
  return `share_${moment}`;
}

export function shareLink(moment: ShareMoment): string {
  return `${SHARE_ORIGIN}/?src=${shareSource(moment)}`;
}

// ลำดับ hatch > evolve > perfect · 3→4 ไม่มีการ์ด "ขึ้นระยะ" ในรอบแรก
export function pickShareMoment(input: {
  evolved: boolean;
  fromStage: number | null;
  toStage: number | null;
  correctInRound: number;
  questionCount: number;
}): ShareMoment | null {
  const { evolved, fromStage, toStage, correctInRound, questionCount } = input;
  if (evolved && fromStage === 1 && toStage === 2) return "hatch";
  if (evolved && fromStage === 2 && toStage === 3) return "evolve";
  // เทียบจำนวนข้อของรอบนี้เท่านั้น — total ของโหมดภารกิจนับรวมข้อจากรอบก่อน
  if (questionCount > 0 && correctInRound === questionCount) return "perfect";
  return null;
}

export const SHARE_CARD_TEXT = {
  wordmark: "QuizMon",
  title: {
    hatch: "เราฟักออกมาแล้ว!",
    evolve: "เราโตขึ้นแล้ว!",
    perfect: "เก็บประกายดาวครบทุกดวง!",
  },
  stage: (stage: number) => `ระยะ ${stage}`,
  perfect: (correct: number) => `ถูก ${correct}/${correct} ข้อ`,
  site: "quizmon.xyz",
  invite: "มาปลุกไข่ของเธอด้วยกันนะ",
  shareText: (link: string) => `มาเล่น QuizMon ด้วยกันนะ ${link}`,
  button: "แชร์ให้เพื่อนดู",
  buttonBusy: "กำลังทำการ์ด…",
  downloaded: "บันทึกรูปและคัดลอกลิงก์แล้ว",
  downloadedNoCopy: "บันทึกรูปแล้ว",
  failed: "ทำการ์ดไม่สำเร็จ ลองอีกครั้งนะ",
} as const;

// src ที่รับจาก query ต้องตรงรายการนี้เท่านั้น (ไม่เก็บค่าที่ใครพิมพ์มาเอง)
const KNOWN_SOURCES: readonly string[] = SHARE_MOMENTS.map(shareSource);

export function parseShareSource(search: string): string | null {
  const src = new URLSearchParams(search).get("src");
  return src && KNOWN_SOURCES.includes(src) ? src : null;
}

const STORAGE_KEY = "qm_share_src";

// เก็บชั่วคราวในแท็บนี้ระหว่าง /login → /guest storage อาจ throw ใน private mode
export function rememberShareSource(src: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, src);
  } catch {}
}

export function readShareSource(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
