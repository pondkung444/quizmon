export type Subject = "math" | "science";

// เวอร์ชันที่ส่งให้ฝั่ง client — ไม่มีเฉลย (correct_index/explanation) ติดไปด้วย
export type PublicQuestion = {
  id: number;
  category: string;
  difficulty: number;
  question_text: string;
  choices: string[];
};
