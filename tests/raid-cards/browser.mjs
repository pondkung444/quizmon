import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Attach only to the disposable agent-browser session supplied by the developer.
const browser = await chromium.connectOverCDP(process.argv[2]);
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mkdir(".cache/raid-screenshots", { recursive: true });
const read = () => page.evaluate(() => JSON.parse(localStorage.getItem("quizmon-raid-card-preview-learning-r3") || "null")?.battle);
async function turn(card, correct = true) {
  const before = await read();
  await page.locator(`[data-card="${card}"]`).click();
  await page.getByRole("region",{name:"คำถามเพื่อใช้การ์ด"}).waitFor();
  assert.deepEqual(await read(),before,"choosing a card must not resolve combat");
  const question=await page.evaluate(()=>JSON.parse(localStorage.getItem("quizmon-raid-card-preview-learning-r3")).question);
  if(before.log.length===0) {
    await page.reload();
    await page.getByRole("region",{name:"คำถามเพื่อใช้การ์ด"}).waitFor();
    assert.equal(await page.getByRole("region",{name:"คำถามเพื่อใช้การ์ด"}).getByText(question.text).count(),1);
    await page.screenshot({path:".cache/raid-screenshots/mobile-question.png"});
  }
  const numbers=question.text.match(/\d+/g).map(Number);
  const right=question.choices.indexOf(String(numbers[0]*numbers[1]));
  const chosen=correct?right:(right+1)%question.choices.length;
  await page.getByRole("region",{name:"คำถามเพื่อใช้การ์ด"}).getByRole("button").nth(chosen).click();
  await page.waitForFunction(count => JSON.parse(localStorage.getItem("quizmon-raid-card-preview-learning-r3") || "null")?.battle.log.length === count + 1, before.log.length);
  const continueButton = page.getByRole("button",{name:"เข้าใจแล้ว ไปต่อ"});
  await continueButton.waitFor();
  const continueBox = await continueButton.boundingBox();
  assert.ok(continueBox && continueBox.y >= 0 && continueBox.y + continueBox.height <= page.viewportSize().height,
    "Continue must be visible without scrolling after answering");
  await continueButton.click();
  return read();
}
try {
  await page.goto("http://127.0.0.1:3108/raid/preview");
  await page.locator('[data-card="strike"]').waitFor();
  await page.getByLabel("เลือกชุดทดลอง").selectOption("trained");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("quizmon-raid-card-preview-learning-r3") || "null")?.profile === "trained");
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: ".cache/raid-screenshots/mobile-start.png" });
  const after = await turn("strike");
  assert.ok(after.bossHp < 200 && after.log.length === 1);
  await page.reload();
  await page.locator('[data-card="strike"]').waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("quizmon-raid-card-preview-learning-r3") || "null")?.battle.log.length === 1);
  assert.deepEqual(await read(),after);
  let state = after;
  while (!state.outcome) state = await turn("strike");
  assert.equal(state.outcome,"win");
  assert.ok(state.log.length <= 5);
  await page.getByRole("heading",{name:"ทำได้แล้ว!"}).waitFor();
  await page.screenshot({ path: ".cache/raid-screenshots/mobile-win.png" });
  for (const boss of ["ridge_gale","ridge_storm"]) {
    await page.getByLabel("เลือกบอสทดลอง").selectOption(boss);
    await page.waitForFunction(id => JSON.parse(localStorage.getItem("quizmon-raid-card-preview-learning-r3") || "null")?.battle.bossId === id,boss);
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  }
  await page.getByLabel("เลือกชุดทดลอง").selectOption("starter");
  state = await read();
  while (!state.outcome) state=await turn("mend",false);
  assert.equal(state.outcome,"defeat");
  assert.ok(state.bossHp > 0 && state.bossHp < 430);
  assert.equal(state.log.length,8);
  assert.equal(state.energy,0);
  await page.getByRole("region",{name:"ผลการต่อสู้"}).waitFor();
  await page.screenshot({ path: ".cache/raid-screenshots/mobile-defeat.png" });
  await page.getByLabel("เลือกชุดทดลอง").selectOption("trained");
  await page.setViewportSize({width:1365,height:900});
  await page.getByRole("button",{name:"เริ่มใหม่",exact:true}).click();
  await page.screenshot({ path: ".cache/raid-screenshots/desktop-storm.png" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log("Browser passed: 390px/1365px, Git images, command resolution, reload resume, win, defeat, all bosses, reduced motion, no page errors.");
} finally { await context.close(); await browser.close(); }
