// Team Battle — view-model แถว Qmon บนจอกลาง (ฟังก์ชันล้วน ไม่แตะ React/DB)
// กฎ: ผลลัพธ์ห้ามมี user_id / username / display_name / student_number / pet_nickname เลย
// (จอกลางโชว์ "Qmon ของทีม" เท่านั้น ไม่โชว์ตัวตนรายคน) — เหลือแค่ team + พาธรูป + key เป็นเลขลำดับ

import type { ClassroomRosterRow, RosterPet } from "@/lib/classroom/roster";
import type { SetupMember, SetupView, TeamId } from "./types";

export type CentralRosterMember = {
  /** เลขลำดับในทีม (opaque) — ไม่ใช่ id ของใคร */
  key: number;
  team: TeamId;
  /** พาธรูป Qmon; null = ไม่มีคู่หู (แสดงเป็นป้ายกลาง) */
  src: string | null;
};

export type CentralRoster = { a: CentralRosterMember[]; b: CentralRosterMember[] };

/** ฟิลด์ pet เท่านั้น — เจตนาไม่รับฟิลด์ที่ระบุตัวตนได้เข้ามาในโมดูลนี้เลย */
export type RosterPetFields = Pick<
  ClassroomRosterRow,
  "pet_stage" | "pet_subline" | "pet_personality" | "pet_sprite_prefix" | "pet_egg_name_th"
>;
export type RosterJoinRow = RosterPetFields & Pick<ClassroomRosterRow, "user_id">;
export type ResolvePet = (fields: RosterPetFields) => RosterPet | null;

/** เพดานจำนวน Qmon ที่วาดต่อทีม (ช่องสุดท้ายเป็น "+N" เมื่อเกิน) */
export const MAX_SHOWN_PER_TEAM = 16;

type Entry = { stage: number; src: string | null };

// ใช้ฟิลด์ pet จากแถว get_classroom_roster ถ้ามี (มี subline/personality ที่รูป stage 3–4 ต้องใช้)
// ไม่มี (เช่น ออกจากห้องไปแล้ว) → ใช้ stage/prefix จาก setup ซึ่งจะไม่มี subline
function petFields(m: SetupMember, roster: RosterJoinRow | undefined): RosterPetFields {
  if (roster) {
    return {
      pet_stage: roster.pet_stage,
      pet_subline: roster.pet_subline,
      pet_personality: roster.pet_personality,
      pet_sprite_prefix: roster.pet_sprite_prefix,
      pet_egg_name_th: roster.pet_egg_name_th,
    };
  }
  return {
    pet_stage: m.pet_stage,
    pet_subline: null,
    pet_personality: null,
    pet_sprite_prefix: m.pet_sprite_prefix,
    pet_egg_name_th: null,
  };
}

function entryOf(m: SetupMember, roster: RosterJoinRow | undefined, resolve: ResolvePet): Entry {
  const f = petFields(m, roster);
  const stage = f.pet_stage ?? 0;
  if (!f.pet_sprite_prefix || !stage) return { stage: 0, src: null };
  const pet = resolve(f);
  if (pet) return { stage, src: pet.imagePath };
  // รูป stage 3–4 ต้องมี subline(+personality) — ขาดแล้วใช้รูปร่างเด็ก (stage 2) ของสปีชีส์เดียวกันแทน ไม่ทำให้จอล่ม
  if (stage >= 3) {
    const baby = resolve({ ...f, pet_stage: 2 });
    if (baby) return { stage: 2, src: baby.imagePath };
  }
  return { stage: 0, src: null };
}

/**
 * join get_team_battle_setup กับ get_classroom_roster ผ่าน user_id แล้วทิ้งทุกอย่างที่ระบุตัวตนได้
 * - เฉพาะผู้เล่น (is_player) ผู้ชมไม่แสดง
 * - ลำดับในทีม: stage สูงก่อน → พาธรูป → ไม่มีคู่หู (ท้ายสุด) — ขึ้นกับหน้าตา Qmon อย่างเดียว
 *   ไม่ขึ้นกับลำดับที่ RPC ส่งมา/เวลาเข้าห้อง/ข้อมูลคำตอบ จึงเสถียรเมื่อรีเฟรชและเดาตัวตนจากตำแหน่งไม่ได้
 *   (ตัวที่หน้าตาเหมือนกันสลับที่กันไม่ได้อยู่แล้ว)
 */
export function toCentralRoster(
  setup: Pick<SetupView, "members">,
  classroomRoster: readonly RosterJoinRow[],
  resolve: ResolvePet
): CentralRoster {
  const byUser = new Map<string, RosterJoinRow>();
  for (const r of classroomRoster) byUser.set(r.user_id, r);

  const buckets: Record<TeamId, Entry[]> = { a: [], b: [] };
  for (const m of setup.members) {
    if (!m.is_player) continue;
    buckets[m.team].push(entryOf(m, byUser.get(m.user_id), resolve));
  }

  const finish = (team: TeamId): CentralRosterMember[] =>
    buckets[team]
      .sort((x, y) => {
        if ((x.src === null) !== (y.src === null)) return x.src === null ? 1 : -1;
        if (x.stage !== y.stage) return y.stage - x.stage;
        return (x.src ?? "").localeCompare(y.src ?? "");
      })
      .map((e, i) => ({ key: i, team, src: e.src }));

  return { a: finish("a"), b: finish("b") };
}

/** อัตราส่วน กว้าง:สูง โดยประมาณของพื้นที่แถว Qmon ในการ์ดทีม (ขวาของเลข HP) — ใช้เลือกจำนวนแถวที่ให้ช่องใหญ่สุด */
export const ROSTER_REGION_ASPECT = 3.8;
const MAX_ROWS = 3;

/**
 * จัดตารางต่อทีม: เลือกจำนวนแถว (1–3) ที่ทำให้ช่องใหญ่ที่สุดในพื้นที่ประมาณ ASPECT:1
 * เกินเพดานแสดง → วาด (เพดาน−1) ตัว + ช่อง "+N" ท้ายสุด (นับเป็น 1 ช่องใน 16)
 */
export function rosterLayout(total: number): { shown: number; extra: number; cols: number; rows: number } {
  const n = Math.max(0, Math.floor(total));
  const overflow = n > MAX_SHOWN_PER_TEAM;
  const shown = overflow ? MAX_SHOWN_PER_TEAM - 1 : n;
  const extra = overflow ? n - shown : 0;
  const cells = shown + (overflow ? 1 : 0);
  let best = { cols: Math.max(1, cells), rows: 1, tile: -1 };
  for (let rows = 1; rows <= MAX_ROWS; rows++) {
    const cols = Math.max(1, Math.ceil(cells / rows));
    const tile = Math.min(ROSTER_REGION_ASPECT / cols, 1 / rows);
    if (tile > best.tile + 1e-9) best = { cols, rows, tile };
  }
  return { shown, extra, cols: best.cols, rows: best.rows };
}

/** ช่องวาดรูปได้ไหม: มี src และ src นั้นยังไม่เคยโหลดไม่ได้ (onError) — ไม่ได้ = ช่อง "Q" */
export function isTileUsable(src: string | null, failedSrc: string | null): src is string {
  return src !== null && src !== failedSrc;
}

/** ชื่อกลางๆ สำหรับ alt/aria — ห้ามใช้ชื่อสปีชีส์/ชื่อเล่น */
export function rosterAlt(team: TeamId): string {
  return `Qmon ทีม ${team.toUpperCase()}`;
}
