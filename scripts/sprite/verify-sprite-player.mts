// รัน: node --experimental-strip-types scripts/sprite/verify-sprite-player.mts
// เช็ค state machine ของ createSpritePlayer (Idle วน / Happy 1 รอบ / แตะซ้ำระหว่าง Happy = false / จบแล้วกลับเฟรม 0)
import { createSpritePlayer } from "../../src/lib/qmonAnimation.ts";
const idle = { src: "i", frames: 16, fps: 8, pingPong: false };
const happy = { src: "h", frames: 16, fps: 12, pingPong: false };
let ok = true;
const check = (name: string, cond: boolean, extra = "") => {
  console.log((cond ? "PASS" : "FAIL") + " " + name + " " + extra);
  if (!cond) ok = false;
};
const p = createSpritePlayer(idle, happy, 0);
let r = p.tick(0);
const DT = 16;
for (let t = 0; t < 1000; t += DT) r = p.tick(DT);
check("idle loops before request", r.clip === "main");
const idleBefore = p.mainElapsed;
check("request while idle -> true", p.requestOther() === true);
check("second request while pending -> false", p.requestOther() === false);
r = p.tick(DT);
check("next tick starts happy at frame 0", r.clip === "other" && r.frame === 0, JSON.stringify(r));
const seen = [r.frame];
const extraReq: boolean[] = [];
let t = 0;
let guard = 0;
while (guard++ < 500) {
  t += DT;
  if (t === 160 || t === 640) extraReq.push(p.requestOther());
  r = p.tick(DT);
  if (r.clip !== "other") break;
  if (seen[seen.length - 1] !== r.frame) seen.push(r.frame);
}
check("request during happy -> false (x2)", extraReq.length === 2 && extraReq.every((v) => v === false), JSON.stringify(extraReq));
check("happy plays frames 0..15 once in order", seen.join(",") === "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15", seen.join(","));
check("after happy ends -> idle frame 0", r.clip === "main" && r.frame === 0, JSON.stringify(r));
check("mainElapsed reset to 0 (not the pre-happy value)", p.mainElapsed === 0 && idleBefore > 0, `before=${idleBefore} now=${p.mainElapsed}`);
r = p.tick(DT);
check("idle continues from frame 0", r.clip === "main" && r.frame === 0, JSON.stringify(r));
check("request after happy done -> true again", p.requestOther() === true);
const q = createSpritePlayer(idle, happy, 625);
r = q.tick(0);
check("resume phase (625ms @8fps -> frame 5)", r.frame === 5, JSON.stringify(r));

// --- เฟส 4: atLoopEnd / นับรอบ Idle / จบ Happy ---
// t = เวลาสะสมตั้งแต่เริ่มทดสอบ (ส่ง t0 ต่อเมื่อรันหลายช่วงกับ player เดียว)
const runUntil = (pl: ReturnType<typeof createSpritePlayer>, ms: number, t0 = 0, dt = 16) => {
  const out: { t: number; clip: string; frame: number }[] = [];
  for (let t = 0; t < ms; t += dt) {
    const f = pl.tick(dt);
    out.push({ t: t0 + t + dt, clip: f.clip, frame: f.frame });
  }
  return out;
};
// idle 16f@8fps = 2000ms/รอบ · นับ onMainLoop ต้องตรงจำนวนรอบจริง
{
  let loops = 0;
  const pl = createSpritePlayer(idle, happy, 0, { onMainLoop: () => loops++ });
  runUntil(pl, 6100);
  check("onMainLoop counts 3 loops in 6.1s", loops === 3, String(loops));
}
{
  let loops = 0;
  const pl = createSpritePlayer(idle, happy, 1900, { onMainLoop: () => loops++ });
  runUntil(pl, 200);
  check("onMainLoop fires when resumed phase crosses wrap", loops === 1, String(loops));
}
{
  // atLoopEnd: ขอที่ ~500ms ต้องยังเป็น Idle จนข้าม wrap (2000ms) แล้วเริ่ม Happy เฟรม 0
  const pl = createSpritePlayer(idle, happy, 0);
  const warm = runUntil(pl, 500); // ลงที่ 512ms
  const t0 = warm[warm.length - 1].t;
  check("atLoopEnd request -> true", pl.requestOther({ atLoopEnd: true }) === true);
  check("second atLoopEnd while waiting -> false", pl.requestOther({ atLoopEnd: true }) === false);
  const seq = runUntil(pl, 2000, t0);
  const firstOther = seq.find((s) => s.clip === "other");
  check("atLoopEnd waits for wrap (Idle 2000ms/loop)", !!firstOther && firstOther.t >= 2000 && firstOther.t < 2032, JSON.stringify(firstOther));
  check("atLoopEnd starts happy at frame 0", firstOther?.frame === 0, JSON.stringify(firstOther));
  check("no happy before the wrap", seq.filter((s) => s.t < 2000).every((s) => s.clip === "main"));
}
{
  // request ทันทีแทรกระหว่างรอ -> เริ่มทันที (tick ถัดไป) และคืน true
  const pl = createSpritePlayer(idle, happy, 0);
  runUntil(pl, 500);
  pl.requestOther({ atLoopEnd: true });
  check("immediate request during atLoopEnd wait -> true", pl.requestOther() === true);
  check("then starts on next tick", pl.tick(16).clip === "other");
  check("another immediate now -> false", pl.requestOther() === false);
}
{
  // request จาก onMainLoop (หลัง wrap แล้ว) ต้องรอรอบถัดไป ไม่เริ่มทันที
  let pl: ReturnType<typeof createSpritePlayer>;
  let asked = 0;
  pl = createSpritePlayer(idle, happy, 0, { onMainLoop: () => { if (asked++ === 0) pl.requestOther({ atLoopEnd: true }); } });
  const seq = runUntil(pl, 6000);
  const firstOther = seq.find((s) => s.clip === "other");
  check("request from onMainLoop starts at NEXT wrap (~4000ms)", !!firstOther && firstOther.t >= 3984 && firstOther.t < 4100, JSON.stringify(firstOther));
}
{
  // pingPong: 1 รอบ = 2*(N-1) สเต็ป (6f@5fps -> 10 สเต็ป = 2000ms)
  const pp = { src: "p", frames: 6, fps: 5, pingPong: true };
  let loops = 0;
  const pl = createSpritePlayer(pp, happy, 0, { onMainLoop: () => loops++ });
  runUntil(pl, 4100);
  check("pingPong loop = 2*(N-1) steps: 2 loops in 4.1s", loops === 2, String(loops));
  const q2 = createSpritePlayer(pp, happy, 0);
  const w2 = runUntil(q2, 300);
  q2.requestOther({ atLoopEnd: true });
  const seq = runUntil(q2, 2000, w2[w2.length - 1].t);
  const firstOther = seq.find((s) => s.clip === "other");
  check("pingPong atLoopEnd waits full period (wrap at 2000ms)", !!firstOther && firstOther.t >= 2000 && firstOther.t < 2032, JSON.stringify(firstOther));
}
{
  // onOtherEnd: เรียกครั้งเดียวตอน Happy จบ แล้วกลับ Idle เฟรม 0
  let ends = 0;
  const pl = createSpritePlayer(idle, happy, 0, { onOtherEnd: () => ends++ });
  pl.requestOther();
  const seq = runUntil(pl, 2000);
  check("onOtherEnd fires once", ends === 1, String(ends));
  const back = seq.find((s, i) => i > 0 && s.clip === "main");
  check("returns to idle frame 0 after happy", back?.frame === 0, JSON.stringify(back));
}
console.log(ok ? "ALL PASS" : "SOME FAIL");
process.exit(ok ? 0 : 1);
