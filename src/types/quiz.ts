export type Subject = "math" | "science";

// ใช้เลือกโหมดของ "รอบ" quiz ไม่ใช่ subject ของคำถามแต่ละข้อ (questions.subject มีแค่ math/science เสมอ
// แม้ในโหมด midterm ที่คำถามแต่ละข้อยังเป็น math หรือ science ตามเดิม แค่สุ่มข้ามหมวดในรอบเดียว)
export type QuizMode = Subject | "midterm";

// เวอร์ชันพื้นฐาน ไม่มีเฉลย — ใช้เป็น base type เท่านั้น
export type PublicQuestion = {
  id: number;
  category: string;
  difficulty: number;
  question_text: string;
  choices: string[];
};

// ใช้ตอนเล่นจริง: มีเฉลย+คำอธิบายติดมาด้วย เพื่อให้ client เช็คถูก/ผิดเองได้ทันที
// โดยไม่ต้องรอ round-trip ไป server (ดู submitAnswer ที่ยังคง re-check จาก DB เสมอ
// เพื่อคำนวณ EXP/คอมโบ — ห้าม trust ค่าจาก client)
export type QuizRoundQuestion = PublicQuestion & {
  correctIndex: number;
  explanation: string | null;
};
