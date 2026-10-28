import { DAILY_EXP_CAP } from "./exp.ts";

export type NextActionId =
  | "hatch_pet"
  | "collect_evolution"
  | "claim_adventure"
  | "daily_mission"
  | "train_to_cap"
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
  mission?: { id: string; remaining: number; bonusExp: number; target?: number } | null;
  adventureStatus?: "invite" | "ready" | "traveling" | "claimable";
  adventureMinutes?: number | null;
  pvpTurnCount?: number;
  raidTicketCount?: number;
  advancedActivitiesUnlocked?: boolean;
  // /adventure เข้าได้จริงไหม (มีรันค้าง หรือ getEligiblePets() ไม่ว่าง — ชุดเดียวกับที่หน้า /adventure ใช้ตัดสิน redirect)
  // บังคับส่ง: false = ข้าม action ที่พาไป /adventure แล้วเช็คตัวถัดไปตามลำดับเดิม (กันปุ่มพาไปแล้วเด้งกลับ /pet)
  adventureOpen: boolean;
  expToday?: number;
  dailyExpCap?: number;
  hasEverAnswered?: boolean;
  weakTopic?: string | null;
  // ไม่บังคับ — ไม่ส่ง = ข้อความภารกิจไม่มีหัวข้อ / ยังไม่เริ่ม
  missionTopic?: string | null;
  missionStarted?: boolean;
};

export function resolveNextAction(state: NextActionState): NextAction {
  if (!state.hasPet) {
    return { id: "hatch_pet", title: "ฟัก Qmon ตัวแรก", description: "เลือกไข่ ตั้งชื่อ แล้วเริ่มเรียนไปด้วยกัน", cta: "เลือกไข่", href: "/eggs", activity: "hatch", meta: "ประมาณ 1 นาที" };
  }
  if (state.evolutionReady) {
    return { id: "collect_evolution", title: "น้องโตครบแล้ว", description: "เก็บเข้าฟาร์ม แล้วเลือกไข่ใบใหม่มาฟัก", cta: "เก็บเข้าฟาร์ม", href: "#collect-qmon", activity: "hatch", meta: "พร้อมเก็บ" };
  }
  if (state.mission && state.mission.remaining > 0) {
    const { remaining, bonusExp, target } = state.mission;
    const count = `${target ?? remaining} ข้อ`;
    return {
      id: "daily_mission",
      title: "ภารกิจวันนี้",
      description: state.missionTopic ? `${state.missionTopic} · ${count}` : count,
      cta: state.missionStarted ? `ทำต่อ · อีก ${remaining} ข้อ` : "เริ่มภารกิจ",
      href: `/quiz?mission=${state.mission.id}`,
      activity: "mission",
      // รางวัลภารกิจตอนนี้คือ EXP + เหรียญฟาร์ม (farm_claim_daily_mission_bonus ไม่ให้อาหารแล้ว)
      meta: `+${bonusExp} EXP และเหรียญฟาร์ม`,
    };
  }
  const dailyExpCap = state.dailyExpCap ?? DAILY_EXP_CAP;
  const expToday = Math.max(0, state.expToday ?? 0);
  if (dailyExpCap > 0 && expToday < dailyExpCap) {
    const remainingExp = dailyExpCap - expToday;
    return {
      id: "train_to_cap",
      title: "ฝึกเพิ่มอีกรอบ",
      description: `วันนี้ยังได้อีก ${remainingExp} EXP`,
      cta: "ฝึกอีกรอบ",
      href: "/quiz",
      activity: "practice",
      meta: `${expToday}/${dailyExpCap} EXP`,
    };
  }
  const advancedActivitiesUnlocked = state.advancedActivitiesUnlocked ?? false;
  const adventureReachable = advancedActivitiesUnlocked && state.adventureOpen;
  if (adventureReachable && state.adventureStatus === "claimable") {
    return { id: "claim_adventure", title: "น้องกลับมาแล้ว", description: "มีของรางวัลจากการผจญภัย", cta: "รับของรางวัล", href: "/adventure", activity: "adventure", meta: "มีรางวัลรอรับ" };
  }
  if (adventureReachable && state.adventureStatus === "ready") {
    return { id: "start_adventure", title: "ส่งน้องไปผจญภัย", description: "เลือกเส้นทาง แล้วกลับมารับของ", cta: "เลือกเส้นทาง", href: "/adventure", activity: "adventure", meta: state.adventureMinutes ? `ประมาณ ${state.adventureMinutes} นาที` : "เลือกเส้นทางได้" };
  }
  if (advancedActivitiesUnlocked && (state.raidTicketCount ?? 0) > 0) {
    return { id: "start_raid", title: "ท้าทายด่าน", description: `มีกุญแจ ${state.raidTicketCount} ดอก`, cta: "เลือกด่าน", href: "/raid", activity: "raid", meta: `มีกุญแจ ${state.raidTicketCount} ดอก` };
  }
  if ((state.pvpTurnCount ?? 0) > 0) {
    return { id: "resume_pvp", title: "ถึงตาเล่นประลอง", description: `มี ${state.pvpTurnCount ?? 0} เกมรออยู่`, cta: "เล่นต่อ", href: "/pvp", activity: "pvp", meta: `${state.pvpTurnCount} เกม` };
  }
  const dailyCapped = dailyExpCap > 0 && expToday >= dailyExpCap;
  return {
    id: "practice",
    title: dailyCapped ? "วันนี้ครบทุกจุดแล้ว" : state.hasEverAnswered ? "ทบทวนให้แม่นขึ้น" : "เริ่มบทเรียนแรก",
    description: dailyCapped
      ? "พรุ่งนี้มีภารกิจใหม่รออยู่"
      : state.hasEverAnswered
        ? state.weakTopic ? `หัวข้อแนะนำ: ${state.weakTopic}` : "เลือกบทแล้วฝึกสั้นๆ กับน้อง"
        : "เลือกวิชาแล้วฝึกสั้นๆ กับน้อง",
    cta: dailyCapped ? "ทบทวนบทที่ชอบ" : state.hasEverAnswered ? "เริ่มทบทวน" : "เริ่มฝึก",
    href: "/quiz",
    activity: "practice",
    meta: dailyCapped ? "วันนี้ได้ EXP ครบแล้ว ทบทวนต่อได้ตามสบาย" : "ประมาณ 3 นาที",
  };
}
