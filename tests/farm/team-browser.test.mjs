import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch();
let checks = 0;
try {
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(120000);
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(size);
    await p.goto((process.env.FARM_TEST_URL ?? "http://localhost:3107")+"/collection/preview?kind=teams");
    await p
      .getByRole("heading", { name: "งานก่อสร้าง · โรงเรียนระดับ 2" })
      .waitFor();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    const helper = p.getByRole("checkbox", { name: "ผู้ช่วยทอง" }),
      second = p.getByRole("checkbox", { name: "ผู้ช่วยเขียว" }),
      adventure = p.getByRole("checkbox", { name: "คู่หูติด Adventure" });
    assert.equal(await adventure.isDisabled(), true);
    checks++;
    await helper.check();
    assert.equal(await second.isDisabled(), true);
    checks++;
    await p.getByRole("button", { name: "บันทึกทีม", exact: true }).click();
    await p
      .locator("[data-team-events]")
      .filter({ hasText: "team:1" })
      .waitFor();
    checks++;
    await helper.uncheck();
    await p.getByRole("button", { name: "บันทึกทีม", exact: true }).click();
    await p
      .locator("[data-team-events]")
      .filter({ hasText: "team:0" })
      .waitFor();
    checks++;
    await p
      .getByRole("button", { name: "ถอนทีม · พักงาน", exact: true })
      .click();
    await p
      .getByRole("button", { name: "เริ่มทำงานต่อ", exact: true })
      .waitFor();
    checks++;
    await p
      .getByLabel("หัวหน้าทีม", { exact: true })
      .selectOption("00000000-0000-4000-8000-000000000001");
    await p.getByRole("button", { name: "เริ่มทำงานต่อ", exact: true }).click();
    await p
      .locator("[data-team-events]")
      .filter({ hasText: "resume:0" })
      .waitFor();
    checks++;
    await p.screenshot({
      path: `test-results/farm-phase3/teams-${size.width}.png`,
      fullPage: true,
    });
  }
  console.log(`Team browser: ${checks} checks passed (synthetic command only)`);
} finally {
  await b.close();
}
