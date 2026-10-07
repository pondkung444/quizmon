import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_SHOWN_PER_TEAM,
  isTileUsable,
  rosterAlt,
  rosterLayout,
  toCentralRoster,
  type ResolvePet,
  type RosterJoinRow,
} from "../../src/lib/teamBattle/centralRoster.ts";
import { ROSTER_RETRY_MS, rosterRetryDelay } from "../../src/lib/teamBattle/rosterLoad.ts";
import type { SetupMember } from "../../src/lib/teamBattle/types.ts";

// fixture ใส่ชื่อทดสอบไว้ตั้งใจ เพื่อยืนยันว่าไม่โผล่ในผลลัพธ์
const NAMES = ["สมชายใจดี", "somchai99", "มะม่วงน้อย", "ด.ช.ทดสอบ", "pet-secret-nick"];

const IMG = (prefix: string, stage: number, sub: string | null, pers: string | null) =>
  stage <= 2
    ? `/pets/${prefix}_stage${stage}.png`
    : `/pets/${prefix}_stage${stage}_${sub}${pers ? `_${pers}` : ""}.png`;

// resolver จำลองพฤติกรรมของจริง: stage 3 ต้องมี subline, stage 4 ต้องมี subline+personality ไม่งั้นคืน null
const resolve: ResolvePet = (f) => {
  if (!f.pet_sprite_prefix || !f.pet_stage) return null;
  if (f.pet_stage >= 3 && !f.pet_subline) return null;
  if (f.pet_stage === 4 && !f.pet_personality) return null;
  return {
    imagePath: IMG(f.pet_sprite_prefix, f.pet_stage, f.pet_subline, f.pet_personality),
    speciesName: "S",
    nickname: null,
  };
};

function member(i: number, o: Partial<SetupMember> = {}): SetupMember {
  return {
    user_id: `u${i}`,
    username: NAMES[1],
    display_name: NAMES[0],
    student_number: i,
    profile_grade_band: null,
    team: "a",
    is_player: true,
    stat: { hp: 50, atk: 50, def: 50, spd: 50, foc: 50 },
    power: 250,
    pet_nickname: NAMES[2],
    pet_stage: 4,
    pet_sprite_prefix: "egg1",
    ...o,
  };
}

function row(i: number, o: Partial<RosterJoinRow> = {}): RosterJoinRow {
  // ใส่ฟิลด์ระบุตัวตนเกินชนิดไว้ด้วย เพื่อยืนยันว่าไม่หลุดออกมา
  return {
    user_id: `u${i}`,
    username: NAMES[1],
    display_name: NAMES[0],
    student_number: i,
    joined_at: "2026-10-07T00:00:00Z",
    pet_nickname: NAMES[4],
    pet_stage: 4,
    pet_subline: "math",
    pet_personality: "A",
    pet_sprite_prefix: "egg1",
    pet_egg_name_th: NAMES[3],
    ...o,
  } as RosterJoinRow;
}

test("toCentralRoster: ไม่มี key/ค่าที่ระบุตัวตนได้ในผลลัพธ์", () => {
  const members = [member(1), member(2, { team: "b" }), member(3, { pet_stage: null, pet_sprite_prefix: null })];
  const out = toCentralRoster(
    { members },
    [row(1), row(2), row(3, { pet_stage: null, pet_sprite_prefix: null })],
    resolve
  );
  const json = JSON.stringify(out);
  for (const k of ["user_id", "username", "display_name", "student_number", "pet_nickname", "joined_at"]) {
    assert.ok(!json.includes(k), k);
  }
  for (const n of NAMES) assert.ok(!json.includes(n), n);
  assert.ok(!/"u\d/.test(json), "ไม่มี id หลุด");
  for (const m of [...out.a, ...out.b]) assert.deepEqual(Object.keys(m).sort(), ["key", "src", "team"]);
});

test("toCentralRoster: ไม่รวมผู้ชม (is_player=false) และแยกทีมถูก", () => {
  const members = [
    member(1),
    member(2, { is_player: false }),
    member(3, { team: "b" }),
    member(4, { team: "b", is_player: false }),
  ];
  const out = toCentralRoster({ members }, [row(1), row(2), row(3), row(4)], resolve);
  assert.equal(out.a.length, 1);
  assert.equal(out.b.length, 1);
  assert.ok(out.a.every((m) => m.team === "a") && out.b.every((m) => m.team === "b"));
});

test("toCentralRoster: ลำดับเสถียร ไม่ขึ้นกับลำดับ input และไม่เกี่ยวกับ id", () => {
  const pets = [
    { pet_stage: 2, pet_sprite_prefix: "egg2", pet_subline: null, pet_personality: null },
    { pet_stage: 4, pet_sprite_prefix: "egg1", pet_subline: "math", pet_personality: "A" },
    { pet_stage: null, pet_sprite_prefix: null, pet_subline: null, pet_personality: null },
    { pet_stage: 3, pet_sprite_prefix: "egg3", pet_subline: "science", pet_personality: null },
    { pet_stage: 4, pet_sprite_prefix: "egg1", pet_subline: "balanced", pet_personality: "B" },
  ];
  const mk = (order: number[]) => {
    const members = order.map((i) =>
      member(i, { pet_stage: pets[i].pet_stage, pet_sprite_prefix: pets[i].pet_sprite_prefix })
    );
    const rows = order.map((i) => row(i, pets[i]));
    return toCentralRoster({ members }, rows, resolve).a.map((m) => m.src);
  };
  const base = mk([0, 1, 2, 3, 4]);
  assert.deepEqual(mk([4, 3, 2, 1, 0]), base);
  assert.deepEqual(mk([2, 0, 4, 1, 3]), base);
  assert.equal(base[base.length - 1], null); // ไม่มีคู่หูอยู่ท้าย
  assert.ok(base[0]!.includes("stage4")); // stage สูงก่อน
});

test("toCentralRoster: key เป็นเลขลำดับ 0..n-1 ต่อทีม", () => {
  const members = Array.from({ length: 5 }, (_, i) => member(i));
  const out = toCentralRoster({ members }, members.map((_, i) => row(i)), resolve);
  assert.deepEqual(out.a.map((m) => m.key), [0, 1, 2, 3, 4]);
});

test("toCentralRoster: stage 3–4 ไม่มี subline → ใช้รูปร่างเด็กแทน ไม่ throw; ไม่มี pet → src null", () => {
  const members = [
    member(1, { pet_stage: 3 }),
    member(2, { pet_stage: 4 }),
    member(3, { pet_stage: null, pet_sprite_prefix: null }),
  ];
  const rows = [
    row(1, { pet_stage: 3, pet_subline: null, pet_personality: null }),
    row(2, { pet_stage: 4, pet_subline: "math", pet_personality: null }),
    row(3, { pet_stage: null, pet_sprite_prefix: null }),
  ];
  const out = toCentralRoster({ members }, rows, resolve);
  assert.deepEqual(out.a.map((m) => m.src), ["/pets/egg1_stage2.png", "/pets/egg1_stage2.png", null]);
  // ไม่มีแถวใน get_classroom_roster เลย (ออกจากห้อง) → ยังได้ผล ไม่ throw
  const noRoster = toCentralRoster({ members }, [], resolve);
  assert.equal(noRoster.a.length, 3);
});

test("rosterLayout: เลือกจำนวนแถวให้ช่องใหญ่สุด, เกินเพดาน 16 เป็น 15 ตัว + +N", () => {
  assert.equal(MAX_SHOWN_PER_TEAM, 16);
  const cells = (n: number) => {
    const l = rosterLayout(n);
    return l.shown + (l.extra > 0 ? 1 : 0);
  };
  for (let n = 0; n <= 60; n++) {
    const l = rosterLayout(n);
    assert.equal(l.shown + l.extra, n, `n=${n}`);
    assert.ok(l.shown <= MAX_SHOWN_PER_TEAM, `n=${n}`);
    assert.ok(cells(n) <= MAX_SHOWN_PER_TEAM, `n=${n}`);
    assert.ok(l.cols * l.rows >= cells(n), `n=${n}: ตารางต้องพอดีทุกช่อง`);
    assert.ok(l.rows >= 1 && l.rows <= 3);
  }
  assert.equal(rosterLayout(3).rows, 1); // น้อยตัว → แถวเดียว ช่องใหญ่
  assert.equal(rosterLayout(10).rows, 2);
  assert.deepEqual(rosterLayout(16), { shown: 16, extra: 0, cols: 8, rows: 2 });
  const big = rosterLayout(30);
  assert.equal(big.shown, 15);
  assert.equal(big.extra, 15); // 30 − 15 ตัวที่วาด = "+15"
  assert.equal(rosterLayout(17).shown, 15);
  assert.equal(rosterLayout(17).extra, 2);
});

test("isTileUsable: รูปโหลดไม่ได้/ไม่มี src → ช่อง Q", () => {
  assert.equal(isTileUsable("/pets/a.png", null), true);
  assert.equal(isTileUsable("/pets/a.png", "/pets/a.png"), false); // onError ของ src นี้
  assert.equal(isTileUsable("/pets/b.png", "/pets/a.png"), true); // src เปลี่ยนแล้วลองใหม่ได้
  assert.equal(isTileUsable(null, null), false);
});

test("rosterRetryDelay: ลองใหม่ 1 ครั้งหลัง 3 วิ แล้วหยุด", () => {
  assert.equal(ROSTER_RETRY_MS, 3000);
  assert.equal(rosterRetryDelay(0), null);
  assert.equal(rosterRetryDelay(1), 3000); // ล้มเหลวครั้งแรก → ลองอีก 1 ครั้ง
  assert.equal(rosterRetryDelay(2), null); // ล้มเหลวครั้งที่สอง → หยุด
  assert.equal(rosterRetryDelay(5), null);
});

test("rosterAlt: ข้อความกลางๆ ไม่มีชื่อ", () => {
  assert.equal(rosterAlt("a"), "Qmon ทีม A");
  assert.equal(rosterAlt("b"), "Qmon ทีม B");
});


function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ""))
    .join(" ");
}

test("โค้ดแถว Qmon: ไม่มีฟิลด์ระบุตัวตน/เฉลย/คำต้องห้าม; hook ไม่รับ realtime", () => {
  const read = (f: string) => stripComments(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"));
  const rowFile = "src/app/teacher/[sessionId]/battle/QmonRow.tsx";
  const files = [
    "src/lib/teamBattle/centralRoster.ts",
    "src/lib/teamBattle/rosterLoad.ts",
    "src/lib/teamBattle/useCentralRoster.ts",
    rowFile,
  ];
  for (const f of files) {
    const code = read(f);
    for (const bad of [
      "correct_index",
      "hintTh",
      '.from("questions")',
      "rosterDisplayName",
      "username",
      "pet_nickname",
      "display_name",
      "student_number",
    ]) {
      assert.ok(!code.includes(bad), `${f}: ${bad}`);
    }
    assert.ok(!/แพ้|ผิดพลาด|ล้มเหลว|ตอบผิด/.test(code), `${f}: คำต้องห้าม`);
  }
  const rowCode = read(rowFile);
  assert.ok(!rowCode.includes("user_id"));
  // hook: ไม่รับ membersVersion/realtime/ตัวจับเวลา — โหลดครั้งเดียวตามธง
  const hook = read("src/lib/teamBattle/useCentralRoster.ts");
  for (const bad of ["membersVersion", "postgres_changes", "channel(", "useTeamBattleState", "setInterval"]) {
    assert.ok(!hook.includes(bad), `hook: ${bad}`);
  }
  // DOM: alt เว้นว่าง + aria-label กลางๆ ไม่มี data-* นอกจาก testid
  assert.ok(rowCode.includes('alt=""'));
  assert.ok(!/data-(?!testid)/.test(rowCode));
  assert.ok(rowCode.includes("memo("));
  assert.ok(rowCode.includes("onError")); // รูปโหลดไม่ได้ → ช่อง Q
  assert.ok(!rowCode.includes("RosterAvatar")); // ไม่แตะคอมโพเนนต์ที่ใช้ร่วมกับหน้าอื่น
  // ตรรกะโหลด/retry อยู่ใน createRosterLoader (เทสด้านบน) — hook ไม่มี retry ของตัวเอง
  assert.ok(hook.includes("createRosterLoader"));
  assert.ok(!hook.includes("setTimeout(() => void"));
});
