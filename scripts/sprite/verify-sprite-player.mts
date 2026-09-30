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
console.log(ok ? "ALL PASS" : "SOME FAIL");
process.exit(ok ? 0 : 1);
