export type NextActionId =
  | "hatch_pet"
  | "collect_evolution"
  | "claim_adventure"
  | "daily_mission"
  | "resume_pvp"
  | "start_adventure"
  | "start_raid"
  | "practice";

export type NextAction = {
  id: NextActionId;
  title: string;
  description: string;
  cta: string;
  href: string;
  activity: "hatch" | "practice" | "mission" | "adventure" | "raid" | "pvp";
  meta: string;
};

export type NextActionState = {
  hasPet: boolean;
  evolutionReady?: boolean;
  mission?: { id: string; remaining: number; bonusExp: number } | null;
  adventureStatus?: "invite" | "ready" | "traveling" | "claimable";
  adventureMinutes?: number | null;
  pvpTurnCount?: number;
  raidTicketCount?: number;
  hasEverAnswered?: boolean;
  weakTopic?: string | null;
};

export function resolveNextAction(state: NextActionState): NextAction {
  if (!state.hasPet) {
    return { id: "hatch_pet", title: "ฟัก Qmon ตัวแรก", description: "เลือกไข่ ตั้งชื่อ แล้วเริ่มเรียนไปด้วยกัน", cta: "เลือกไข่", href: "/eggs", activity: "hatch", meta: "ประมาณ 1 นาที" };
  }
  if (state.evolutionReady) {
    return { id: "collect_evolution", title: "Qmon โตเต็มที่แล้ว", description: "เก็บเข้าฟาร์มเพื่อเปิดรอบการเลี้ยงตัวถัดไป", cta: "รับการเติบโต", href: "#collect-qmon", activity: "hatch", meta: "พร้อมรับทันที" };
  }
  if (state.adventureStatus === "claimable") {
    return { id: "claim_adventure", title: "Qmon กลับจากผจญภัยแล้ว", description: "เปิดผลการเดินทางและรับรางวัลที่รออยู่", cta: "รับผลผจญภัย", href: "/adventure", activity: "adventure", meta: "มีรางวัลรอรับ" };
  }
  if (state.mission && state.mission.remaining > 0) {
    return { id: "daily_mission", title: "ทำภารกิจวันนี้ต่อ", description: `เหลืออีก ${state.mission.remaining} ข้อ รับโบนัส ${state.mission.bonusExp} EXP`, cta: "เริ่มภารกิจ", href: `/quiz?mission=${state.mission.id}`, activity: "mission", meta: `${state.mission.remaining} ข้อ` };
  }
  if ((state.pvpTurnCount ?? 0) > 0) {
    return { id: "resume_pvp", title: "ถึงตาคุณประลองแล้ว", description: `มี ${(state.pvpTurnCount ?? 0)} เกมที่รอการตัดสินใจ`, cta: "เล่นเทิร์นต่อ", href: "/pvp", activity: "pvp", meta: `${state.pvpTurnCount} เกม` };
  }
  if (state.adventureStatus === "ready") {
    return { id: "start_adventure", title: "ส่ง Qmon ไปผจญภัย", description: "เลือกเส้นทางแล้วกลับมารับของรางวัล", cta: "เลือกการผจญภัย", href: "/adventure", activity: "adventure", meta: state.adventureMinutes ? `ประมาณ ${state.adventureMinutes} นาที` : "เลือกเส้นทางได้" };
  }
  if ((state.raidTicketCount ?? 0) > 0) {
    return { id: "start_raid", title: "พร้อมท้าทายด่าน", description: "ใช้กุญแจที่มีเพื่อพา Qmon ลุยด่าน", cta: "เลือกด่าน", href: "/raid", activity: "raid", meta: `มีกุญแจ ${state.raidTicketCount} ดอก` };
  }
  return {
    id: "practice",
    title: state.hasEverAnswered ? "ทบทวนให้แม่นขึ้น" : "เริ่มบทเรียนแรก",
    description: state.weakTopic ? `หัวข้อแนะนำ: ${state.weakTopic}` : "เลือกวิชาและฝึกสั้น ๆ เพื่อเพิ่มพลังให้ Qmon",
    cta: state.hasEverAnswered ? "เริ่มทบทวน" : "เริ่มฝึก Qmon",
    href: "/quiz",
    activity: "practice",
    meta: "ประมาณ 3 นาที",
  };
}
