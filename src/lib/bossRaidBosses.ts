// Classroom Boss Raid — สายพันธุ์บอสให้ครูเลือกตอนตั้งค่าห้อง (config.boss_key)
// cosmetic ล้วน: ไม่มีผลต่อ stat/สูตร (rarity = หน้าตา ไม่ใช่พลัง — หลักเดิมของเกม)
// เก็บใน boss_raid_sessions.config.boss_key (jsonb, optional) — เซสชันเก่า/ไม่ได้เลือก => fallback "ridge_mist"
//
// ⚠️ art ของ snow_leopard / wolf_king ยังไม่มี — ตอนนี้ยืมสไปรต์ ridge_mist ไปก่อน (ต่างกันแค่ชื่อ)
// พอได้ art จริงให้วางไฟล์ public/raid/boss_snow_leopard.png และ public/raid/boss_wolf_king.png
// (1024×1536 เท่ากับ boss_ridge_mist.png) แล้วแก้ sprite/spriteAspect ด้านล่าง — ไม่ต้องแตะโค้ดอื่น

export type BossRaidBossKey = "ridge_mist" | "snow_leopard" | "wolf_king";

export type BossRaidBoss = {
  key: BossRaidBossKey;
  nameTh: string;
  sprite: string;
  spriteAspect: number; // width / height — ใช้คุมตำแหน่ง/สัดส่วนบนจอ TV
};

const RIDGE_MIST_SPRITE = "/raid/boss_ridge_mist.png";
const RIDGE_MIST_ASPECT = 1024 / 1536;

export const BOSS_RAID_BOSSES: Record<BossRaidBossKey, BossRaidBoss> = {
  ridge_mist: {
    key: "ridge_mist",
    nameTh: "จิ้งจอกหิมะ",
    sprite: RIDGE_MIST_SPRITE,
    spriteAspect: RIDGE_MIST_ASPECT,
  },
  // placeholder — ยืมสไปรต์ ridge_mist จนกว่า art จริงจะมา (ดูหมายเหตุหัวไฟล์)
  snow_leopard: {
    key: "snow_leopard",
    nameTh: "เสือดาวหิมะ",
    sprite: RIDGE_MIST_SPRITE,
    spriteAspect: RIDGE_MIST_ASPECT,
  },
  // placeholder — ยืมสไปรต์ ridge_mist จนกว่า art จริงจะมา (ดูหมายเหตุหัวไฟล์)
  wolf_king: {
    key: "wolf_king",
    nameTh: "พญาหมาป่า",
    sprite: RIDGE_MIST_SPRITE,
    spriteAspect: RIDGE_MIST_ASPECT,
  },
};

export const DEFAULT_BOSS_RAID_BOSS_KEY: BossRaidBossKey = "ridge_mist";

// รายการให้ปุ่มเลือกใน ConfigPanel — เรียงตามลำดับที่อยากโชว์
export const BOSS_RAID_BOSS_OPTIONS: BossRaidBoss[] = [
  BOSS_RAID_BOSSES.ridge_mist,
  BOSS_RAID_BOSSES.snow_leopard,
  BOSS_RAID_BOSSES.wolf_king,
];

// resolve แบบกันพัง: key ที่ไม่รู้จัก / undefined => บอส default
export function resolveBossRaidBoss(key: string | null | undefined): BossRaidBoss {
  if (key && key in BOSS_RAID_BOSSES) {
    return BOSS_RAID_BOSSES[key as BossRaidBossKey];
  }
  return BOSS_RAID_BOSSES[DEFAULT_BOSS_RAID_BOSS_KEY];
}
