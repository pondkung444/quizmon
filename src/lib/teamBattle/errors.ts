// Team Battle — แปลรหัส error ของ RPC เป็นข้อความไทย
// โทนอบอุ่น ไม่ตัดสิน (ไม่ใช้คำว่าแพ้/ผิดพลาดแรง ๆ)
//   silent   = client refetch เงียบ ๆ ไม่ต้องโชว์อะไร (message ไว้ให้ใช้ถ้าอยากบอกเบา ๆ)
//   soft     = แจ้งเบา ๆ แล้ว refetch (เช่น หมดเวลาของยกนี้)
//   blocking = ต้องให้ผู้ใช้ (ส่วนใหญ่ครู) เห็นและแก้ก่อนทำต่อ

import type { CheckBlockCode, CheckWarnCode } from "./types";

export type BattleErrorKind = "silent" | "soft" | "blocking";
export type ExplainedError = { kind: BattleErrorKind; code: string; message: string };

const GENERIC: ExplainedError = {
  kind: "soft",
  code: "unknown",
  message: "เชื่อมต่อไม่สำเร็จ ลองอีกครั้งนะ",
};

const TABLE: Record<string, { kind: BattleErrorKind; message: string }> = {
  // ---- เงียบ: ผู้เล่นชนกับสถานะที่เปลี่ยนไปแล้ว ----
  invalid_card: { kind: "silent", message: "การ์ดใบนี้ถูกเลือกไปแล้ว" },
  already_answered: { kind: "silent", message: "ส่งคำตอบไปแล้ว" },

  // ---- เบา ๆ: เวลา/ช่วงเกมเปลี่ยนไป ----
  round_closed: { kind: "soft", message: "ยกนี้หมดเวลาแล้ว รอยกถัดไปนะ" },
  not_answering: { kind: "soft", message: "ตอนนี้ยังไม่ใช่ช่วงตอบคำถาม" },
  not_picking: { kind: "soft", message: "ตอนนี้ยังไม่ใช่ช่วงเลือกการ์ด" },
  battle_not_active: { kind: "soft", message: "เกมนี้ไม่ได้กำลังเล่นอยู่แล้ว" },
  not_a_defender: { kind: "soft", message: "ยกนี้ทีมของเราเป็นฝ่ายส่งการ์ด ไม่ต้องตอบ" },
  invalid_answer: { kind: "soft", message: "ตัวเลือกนี้ใช้ไม่ได้ ลองเลือกใหม่อีกครั้ง" },

  // ---- ต้องแสดง (ฝั่งครู/ระบบ) ----
  not_enough_questions: {
    kind: "blocking",
    message: "โจทย์ในบทที่เลือกยังน้อยเกินไป ลองเพิ่มบทเรียนอีกสักหน่อย",
  },
  classroom_activity_busy: {
    kind: "blocking",
    message: "ห้องนี้มีกิจกรรมอื่นกำลังทำอยู่ จบกิจกรรมนั้นก่อนแล้วค่อยเริ่มใหม่",
  },
  battle_not_in_setup: { kind: "blocking", message: "เกมนี้เริ่มไปแล้ว แก้ทีมไม่ได้อีก" },
  invalid_team: { kind: "blocking", message: "ทีมที่เลือกไม่ถูกต้อง" },
  invalid_swap: { kind: "blocking", message: "สลับได้เฉพาะนักเรียนที่อยู่คนละทีมกัน" },
  member_not_found: { kind: "blocking", message: "ไม่พบนักเรียนคนนี้ในเกมแล้ว ลองซิงก์รายชื่อใหม่" },
  not_authorized_or_not_found: { kind: "blocking", message: "ไม่พบเกมนี้ หรือไม่มีสิทธิ์เข้าถึง" },
  not_authenticated: { kind: "blocking", message: "กรุณาเข้าสู่ระบบอีกครั้ง" },
};

const CONFIG_MESSAGES: Record<string, string> = {
  invalid_config_grade_band: "กรุณาเลือกช่วงชั้น",
  invalid_config_subject: "กรุณาเลือกวิชา",
  invalid_config_chapters: "กรุณาเลือกบทเรียนอย่างน้อย 1 บท (ไม่เกิน 30 บท)",
  invalid_config_pick_seconds: "เวลาเลือกการ์ดต้องอยู่ระหว่าง 5–60 วินาที",
  invalid_config_answer_seconds: "เวลาตอบคำถามต้องอยู่ระหว่าง 10–120 วินาที",
  invalid_config_time_limit: "เวลาทั้งเกมต้องอยู่ระหว่าง 3–90 นาที",
};

// ข้อความเตือนของครูก่อนเริ่มเกม (จาก checks ของ get_team_battle_setup)
const CHECK_MESSAGES: Record<CheckBlockCode | CheckWarnCode, string> = {
  team_too_small: "แต่ละทีมต้องมีผู้เล่นอย่างน้อย 2 คน",
  mixed_band: "ห้องนี้มีนักเรียนต่างช่วงชั้น ลองแยกเป็นห้องหรือตัดบางคนเป็นผู้ชม",
  questions_block: "โจทย์ในบทที่เลือกยังน้อยเกินไป ลองเพิ่มบท",
  team_size_diff: "สองทีมจำนวนคนต่างกันเล็กน้อย เล่นต่อได้",
  questions_low: "โจทย์ค่อนข้างน้อย บางข้ออาจซ้ำ",
};

export function explainCheck(code: CheckBlockCode | CheckWarnCode): string {
  return CHECK_MESSAGES[code];
}

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

/** แปลง error จาก RPC (PostgREST ใส่รหัส exception ไว้ใน message) เป็นข้อความไทย + ประเภท */
export function explainBattleError(err: unknown): ExplainedError {
  const raw = messageOf(err);
  if (!raw) return GENERIC;

  // cannot_start: ["team_too_small","questions_block"] → ข้อความของ check ตัวแรกที่รู้จัก
  if (raw.includes("cannot_start")) {
    const known = Object.keys(CHECK_MESSAGES).filter((c) => raw.includes(c));
    const detail = known.map((c) => CHECK_MESSAGES[c as CheckBlockCode]).join(" · ");
    return {
      kind: "blocking",
      code: "cannot_start",
      message: detail ? `ยังเริ่มเกมไม่ได้: ${detail}` : "ยังเริ่มเกมไม่ได้ ตรวจรายชื่อทีมและโจทย์อีกครั้ง",
    };
  }

  for (const code of Object.keys(CONFIG_MESSAGES)) {
    if (raw.includes(code)) return { kind: "blocking", code, message: CONFIG_MESSAGES[code] };
  }

  for (const code of Object.keys(TABLE)) {
    if (raw.includes(code)) return { code, ...TABLE[code] };
  }

  return GENERIC;
}
