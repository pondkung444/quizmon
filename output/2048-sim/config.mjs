// Single source of truth for everything the simulation assumes.
// Written verbatim into every results folder as run-config.json.

export const EGGS = {
  egg1: { name: 'เพลิง', rarity: 'Common',    stats: { hp: 71, atk: 57, def: 64, spd: 72, foc: 72 } },
  egg2: { name: 'พฤกษ์', rarity: 'Common',    stats: { hp: 50, atk: 33, def: 40, spd: 36, foc: 44 } },
  egg4: { name: 'ธาร',   rarity: 'Rare',      stats: { hp: 77, atk: 37, def: 45, spd: 55, foc: 63 } },
  egg5: { name: 'นภา',   rarity: 'Epic',      stats: { hp: 75, atk: 26, def: 38, spd: 58, foc: 66 } },
  egg6: { name: 'ธรา',   rarity: 'Epic',      stats: { hp: 67, atk: 44, def: 52, spd: 59, foc: 62 } },
  egg3: { name: 'เทพ',   rarity: 'Legendary', stats: { hp: 87, atk: 33, def: 51, spd: 67, foc: 61 } },
};
export const LANES = ['math', 'science', 'balanced'];      // index*2 (+1 if B) = skill index in AUTO_SKILLS
export const PERSONALITIES = ['A', 'B'];
export const POLICIES = ['random', 'greedy', 'greedy-egg'];

export const SKILL_NAMES = {
  egg1: ['คมเพลิงต่อเนื่อง', 'ปราการแก้วอัคคี', 'ลาวาปะทุ', 'อัสนีอัคคี', 'คำรามราชัน', 'เกราะสุริยัน'],
  egg2: ['งาหนามทะลวง', 'เปลือกไม้ซ้อนชั้น', 'บุปผาระเบิด', 'รากหล่อเลี้ยง', 'พรแห่งพงไพร', 'พฤกษ์ค้ำจุน'],
  egg4: ['คมผลึกเยือกแข็ง', 'ปราการน้ำแข็ง', 'คำรามเยือกสะท้าน', 'ธารเย็นหล่อเลี้ยง', 'พายุหิมะ', 'ผลึกเหมันต์พิทักษ์'],
  egg5: ['อัสนีทวีคม', 'ประจุพิทักษ์', 'เมฆาคำราม', 'ม่านเมฆอัมพาต', 'อัสนีแปรรูน', 'อัสนีประสานฟ้า'],
  egg6: ['ศรแกนศิลา', 'ตราปราการ', 'แผ่นดินคำราม', 'มหาปราการ', 'พรแห่งผืนดิน', 'ฌานยกระดับศิลา'],
  egg3: ['รังสีพิพากษา', 'ตราอนันต์', 'พฤกษ์แปรทิพย์', 'สวนทิพย์ผลิบาน', 'เพลิงยกระดับ', 'ตรามหาพร'],
};

// Forms: 36 Stage-4 forms + 6 control forms (Stage 1-3 fallback: all stats 50, no Auto skill).
export function buildForms({ control = true } = {}) {
  const forms = [];
  for (const [egg, e] of Object.entries(EGGS)) {
    LANES.forEach((lane, li) => PERSONALITIES.forEach((p, pi) => {
      forms.push({
        form_id: `${egg}-${lane}-${p}`, group: 'stage4', stage: 4, egg, egg_name: e.name, rarity: e.rarity,
        lane, personality: p, skill_index: li * 2 + pi, skill_name: SKILL_NAMES[egg][li * 2 + pi], stats: e.stats,
      });
    }));
  }
  if (control) for (const [egg, e] of Object.entries(EGGS)) {
    forms.push({
      form_id: `${egg}-control`, group: 'control_stage1-3', stage: 3, egg, egg_name: e.name, rarity: e.rarity,
      lane: 'balanced', personality: 'A', skill_index: null, skill_name: null,
      stats: { hp: 50, atk: 50, def: 50, spd: 50, foc: 50 },
    });
  }
  return forms;
}

export const DEFAULTS = {
  seeds: 200,
  policies: POLICIES,
  quizP: 0.7,            // P(correct) per quiz question (sim assumption)
  maxSwipes: 6000,       // per run; beyond this the run is recorded as 'timeout'
  secondsPerSwipe: [1.5, 2.5],  // assumption, for time estimate only
  secondsPerNonBattleRoom: 10,  // assumption
};

// Rules/assumptions that live OUTSIDE the engine (bot + harness). Keep in sync with README.
export const HARNESS_RULES = {
  engine: 'verbatim copy of quizmon main 2fc0896 (see engine/SOURCE.json). Real run.js/engine.js/skills.js/runes.js executed in node:vm; only UI functions are stubbed.',
  config: 'forestConfig() imported from the real stats.ts; no gear; no cap clipping (averages assumed below caps).',
  seeds: 'game seed (run.seed) = hash(seedIndex) identical across forms and policies; bot RNG = mulberry32(hash(seedIndex, policy)), separate from game RNG.',
  policies: {
    random: 'uniform among directions whose slide() changes the board',
    greedy: 'max number of merges this swipe; ties broken by bot RNG',
    'greedy-egg': 'max number of merges whose result tile type is the egg rune (x); then max merges; ties by bot RNG',
  },
  nonSwipeDecisions: {
    doors: 'uniform random among offered doors',
    relicChoice: 'uniform random among offered relics (so win-rate-with-relic is not selection-biased)',
    shop: 'while any not-owned offer is affordable (40 coins), buy a uniformly random affordable one; then leave',
    rest: 'always rest (the only action)',
    quiz: 'each question answered correctly with probability quizP, otherwise a uniformly random wrong option',
    quizReward: 'if quiz passed: take a relic when any is still available, otherwise 25 coins',
    revive: 'always accept the revive quiz (needs 3/3 correct)',
  },
  inlineActionsReimplemented: 'rest, shop-buy, quizReward, revivePrompt and empty-relic-coin actions are inline closures inside showPhase() in run.js and cannot be called; they are re-implemented 1:1 in ctx-driver.js (search "MIRROR run.js").',
  attribution: {
    skill_dmg: 'effective enemy HP removed inside autoTick/autoMergeEffects/autoPostMerges/autoSpark/autoAfterAttack/autoCast (clamped by remaining enemy HP, after beetle stance)',
    ord_dmg: 'total effective enemy HP removed in the swipe minus skill_dmg = ordinary rune/merge damage + rune periodic burn + quake counter + thorn relic',
    skill_armor: 'gross armor added inside the same skill functions (includes overflow-heal armor)',
    ord_armor: 'gross armor from ordinary merges, parsed from the swipe log line',
    skill_heal: 'effective HP healed inside the skill functions',
    ord_heal: 'effective HP healed by ordinary merges + bloom periodic, parsed from the swipe log line',
    note: 'armor is gross (before it is reset to 0 by the next enemy attack); it is NOT armor actually used.',
  },
  jam: 'recover() called with canMove()==false: HP -ceil(0.25*maxHP) ignoring armor, lowest half of tiles cleared.',
  roots: 'only the stag (room 8) adds roots. applied = new f==2 tiles at the stag-attack log line; hits/released from slide() preview (release = f reaches 0).',
  timeEstimate: 'seconds = swipes*secondsPerSwipe + (nonbattle_rooms + revive_used)*secondsPerNonBattleRoom (nonbattle_rooms = rest/shop/quiz doors entered). Door-choice time, animation and reading time are NOT modelled. Assumption only.',
  stage1to3Control: 'stats 50 each, stage 3, skillIdentity()==null so autoCast never fires; runes + relics + rooms identical.',
};
