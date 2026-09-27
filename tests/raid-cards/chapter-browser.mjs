import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.connectOverCDP(process.argv[2]);
const out = ".cache/raid-four-chapters";
await mkdir(out, { recursive: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const KEY = "quizmon-raid-chapters-preview-v4";
const read = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), KEY);
await page.goto("http://localhost:3107/raid/preview");
await page.locator("[data-offer]").first().waitFor();
for (const [name, width, height] of [
  ["mobile", 390, 844],
  ["ipad", 1024, 768],
  ["desktop", 1440, 900],
]) {
  await page.setViewportSize({ width, height });
  assert.equal(await page.locator("[data-offer]").count(), 4);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: out + "/" + name + "-hand.png",
    fullPage: true,
  });
}
await page.setViewportSize({ width: 390, height: 844 });
for (const boss of ["ridge_mist", "ridge_gale", "ridge_storm"])
  for (const correct of [true, false]) {
    await page.getByLabel("เลือกบอสทดลอง").selectOption(boss);
    await page.getByRole("button", { name: "เริ่มใหม่", exact: true }).click();
    let turns = 0;
    while (!(await read()).battle.outcome) {
      const before = await read();
      await page.locator("[data-offer]").first().click();
      await page.getByRole("region", { name: "คำถามเพื่อใช้การ์ด" }).waitFor();
      const pending = await read();
      assert.equal(
        pending.battle.log.length,
        before.battle.log.length,
        "choosing does not play a turn",
      );
      if (turns === 0) {
        await page.reload();
        await page
          .getByRole("region", { name: "คำถามเพื่อใช้การ์ด" })
          .waitFor();
        assert.deepEqual(
          (await read()).question,
          pending.question,
          "refresh preserves question",
        );
        await page.screenshot({
          path: out + "/" + boss + "-question.png",
          fullPage: true,
        });
      }
      const index = correct ? pending.answerKey : (pending.answerKey + 1) % 4;
      await page.getByTestId("answer-card").nth(index).click();
      await page
        .getByRole("button", { name: "ยืนยันคำตอบ · ใช้ท่านี้" })
        .click();
      await page.getByRole("region", { name: "ผลคำตอบและเฉลย" }).waitFor();
      const next = await read();
      assert.equal(next.battle.log.length, before.battle.log.length + 1);
      assert.equal(next.feedback.correct, correct);
      const continueButton = page.getByRole("button", {
        name: /กลับไปเลือกท่าถัดไป|ดูผลการท้าทาย/,
      });
      const box = await continueButton.boundingBox();
      assert.ok(
        box && box.y >= 0 && box.y + box.height <= 844,
        "continue stays in viewport",
      );
      if (turns === 0)
        await page.screenshot({
          path: out + "/" + boss + "-feedback.png",
          fullPage: true,
        });
      await continueButton.click();
      turns++;
      assert.ok(turns <= 8);
    }
    assert.equal((await read()).battle.outcome, correct ? "win" : "defeat");
    await page.getByRole("button", { name: "ทดลองอีกครั้ง" }).waitFor();
  }
assert.deepEqual(errors, []);
console.log(
  "Browser passed: 3 viewports; 6 complete runs; pending-question reload; visible feedback controls; no page errors.",
);
await context.close();
await browser.close();
