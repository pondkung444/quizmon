import test from "node:test";
import assert from "node:assert/strict";
import { isTeamBattleRunning } from "../../src/lib/teamBattle/running.ts";

test("running: setup/active = กำลังเล่น", () => {
  assert.equal(isTeamBattleRunning("setup"), true);
  assert.equal(isTeamBattleRunning("active"), true);
});

test("running: finished/abandoned/null/ไม่พบ/ไม่รู้จัก = ไม่ได้เล่น (ห้องค้าง team_battle + pointer เก่า)", () => {
  assert.equal(isTeamBattleRunning("finished"), false);
  assert.equal(isTeamBattleRunning("abandoned"), false);
  assert.equal(isTeamBattleRunning(null), false);
  assert.equal(isTeamBattleRunning(undefined), false);
  assert.equal(isTeamBattleRunning(""), false);
  assert.equal(isTeamBattleRunning("Active"), false);
});

// ข้อความ UI ใหม่ของ PR 4.5 (TeacherRoomClient) — ไม่มีคำต้องห้าม
const TEACHER_ENTRY_TEXTS = [
  "Team Battle",
  "แบ่งทีม ช่วยกันตอบ สู้ด้วย Qmon",
  "ไปจอ Team Battle · จบเกมที่นั่น",
  " — Team Battle ที่ยังเล่นอยู่จะจบไปด้วย",
];

test("ข้อความ UI ใหม่ของทางเข้าครูไม่มีคำว่าแพ้/ผิดพลาด/ล้มเหลว/ตอบผิด", () => {
  for (const t of TEACHER_ENTRY_TEXTS) assert.ok(!/แพ้|ผิดพลาด|ล้มเหลว|ตอบผิด/.test(t), t);
});

import { readFileSync } from "node:fs";

test("ข้อความที่ทดสอบอยู่ใน TeacherRoomClient จริง (กันสำเนาใน test ไม่ตรงโค้ด)", () => {
  const src = readFileSync(
    new URL("../../src/app/teacher/[sessionId]/TeacherRoomClient.tsx", import.meta.url),
    "utf8"
  );
  for (const t of TEACHER_ENTRY_TEXTS) assert.ok(src.includes(t), t);
});
