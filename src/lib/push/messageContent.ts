import type { EligibleRecipient } from "@/lib/push/eligibility";
import type { BuiltMessage } from "@/lib/push/dispatchNotifications";
import { DAILY_EXP_CAP } from "@/lib/exp";

// ไม่มี negative framing / punishment mechanics ในทุกข้อความ ตาม core principle ของเกม
// ไม่ส่งถ้า user ยังไม่มี Qmon ที่ active เลย (ยังไม่เคยฟักไข่) — ป้องกัน push ที่ไม่มี context อ้างอิง

export function buildDailyQuestMessage(recipient: EligibleRecipient): BuiltMessage | null {
  if (!recipient.pet) return null;
  return {
    title: "QuizMon",
    body: `${recipient.pet.nickname} รอเธออยู่นะ 🌱 แวะมาทำภารกิจวันนี้กัน`,
    deepLink: "/quiz",
  };
}

export function buildDailyExpMessage(recipient: EligibleRecipient): BuiltMessage | null {
  if (!recipient.pet) return null;
  const { nickname, expToday } = recipient.pet;

  let body: string;
  if (expToday === 0) {
    body = `วันนี้ยังไม่ได้แวะมาเลย ${nickname} รอเธออยู่นะ`;
  } else if (expToday < 60) {
    body = `วันนี้เก็บได้ ${expToday}/${DAILY_EXP_CAP} EXP แล้ว ลองแวะมาต่ออีกนิดไหม`;
  } else if (expToday < 120) {
    body = `ไปได้สวย! วันนี้เก็บได้ ${expToday}/${DAILY_EXP_CAP} EXP แล้ว`;
  } else if (expToday < 160) {
    body = `ใกล้แล้ว! วันนี้เก็บได้ ${expToday}/${DAILY_EXP_CAP} EXP`;
  } else if (expToday < DAILY_EXP_CAP) {
    body = `เกือบตันแล้ว เหลืออีกนิดเดียว (${expToday}/${DAILY_EXP_CAP} EXP)`;
  } else {
    body = `วันนี้ทำเต็มที่แล้ว! 🎉 ${nickname} เก็บครบ ${DAILY_EXP_CAP} EXP`;
  }

  return { title: "QuizMon", body, deepLink: "/pet" };
}
