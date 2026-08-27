export type Subject = "math" | "science";

// สายฝึกของ senior (ม.6) — คนละมิติกับ Subject เดิม (questions.subject ยังมีแค่ math/science เสมอ
// แม้แถวที่มี branch: branch=physics -> subject=math, branch=chemistry/biology -> subject=science)
export type SeniorBranch = "physics" | "chemistry" | "biology";

// ใช้เลือกโหมดของ "รอบ" quiz ไม่ใช่ subject ของคำถามแต่ละข้อ — junior ส่ง Subject (math/science) เดิม,
// senior ส่ง SeniorBranch (physics/chemistry/biology) แทน
export type QuizMode = Subject | SeniorBranch;

// เวอร์ชันพื้นฐาน ไม่มีเฉลย — ใช้เป็น base type เท่านั้น
export type PublicQuestion = {
  id: number;
  subject: Subject;
  category: string;
  difficulty: number;
  question_text: string;
  choices: string[];
  // รูปประกอบโจทย์ — null ถ้าไม่มี ค่าที่มีตอนนี้เป็น data URI (data:image/...;base64,...) แต่
  // รองรับ external URL (เช่น Supabase Storage ในอนาคต) ได้เลยโดยไม่ต้องแก้โค้ด
  image_url: string | null;
};

// ใช้ตอนเล่นจริง: มีเฉลย+คำอธิบายติดมาด้วย เพื่อให้ client เช็คถูก/ผิดเองได้ทันที
// โดยไม่ต้องรอ round-trip ไป server (ดู submitAnswer ที่ยังคง re-check จาก DB เสมอ
// เพื่อคำนวณ EXP/คอมโบ — ห้าม trust ค่าจาก client)
export type QuizRoundQuestion = PublicQuestion & {
  correctIndex: number;
  explanation: string | null;
};
