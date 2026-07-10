export type PersonalityQuestion = {
  id: string;
  // ใช้ {speciesName} แทนตำแหน่งชื่อสัตว์ (ชื่อ "base" ของ subline จาก getSublineBaseName)
  prompt: string;
  choiceA: string; // ตัวเลือกซ้าย -> personality A
  choiceB: string; // ตัวเลือกขวา -> personality B
};

export const PERSONALITY_QUESTIONS: PersonalityQuestion[] = [
  {
    id: "departure",
    prompt: "เจ้า{speciesName}กำลังจะออกผจญภัยครั้งแรก มันหันมามองเจ้า…",
    choiceA: "ลุยเลย! เจออะไรค่อยว่ากัน",
    choiceB: "สำรวจให้รอบก่อน แล้วค่อยไป",
  },
  {
    id: "obstacle",
    prompt: "ข้างหน้ามีเจ้าตัวใหญ่ยืนขวางทางอยู่…",
    choiceA: "พุ่งเข้าใส่ก่อนเลย!",
    choiceB: "ตั้งหลักไว้ รอดูจังหวะมันก่อน",
  },
  {
    id: "free_day",
    prompt: "วันสบายๆ ไม่มีอะไรทำ เจ้า{speciesName}อยาก…",
    choiceA: "วิ่งซนไปทั่ว อยู่นิ่งไม่ได้",
    choiceB: "นอนอาบแดดเงียบๆ สบายใจ",
  },
  {
    id: "new_friend",
    prompt: "เจอเพื่อนตัวใหม่ที่ไม่เคยรู้จัก…",
    choiceA: "รี่เข้าไปทักก่อนเลย!",
    choiceB: "ดูเชิงเงียบๆ สักพักก่อน",
  },
];

export function pickRandomPersonalityQuestion(): PersonalityQuestion {
  return PERSONALITY_QUESTIONS[Math.floor(Math.random() * PERSONALITY_QUESTIONS.length)];
}

export function formatPersonalityPrompt(question: PersonalityQuestion, speciesName: string): string {
  return question.prompt.replaceAll("{speciesName}", speciesName);
}
