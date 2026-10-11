import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const b = await chromium.launch();
let checks = 0;
const errors = [],
  timings = [];
try {
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(120000);
  p.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync("test-results/farm-phase4", { recursive: true });
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(size);
    for (const count of [17, 24]) {
      await p.goto(
        "http://localhost:3107/collection/preview?kind=layout" + count,
      );
      await p.locator('[data-farm-camera-ready="true"]').waitFor();
      assert.equal(await p.locator("[data-farm-tile]").count(), count);
      checks++;
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      checks++;
      const start = Date.now();
      await p.getByRole("button", { name: "ซูมเข้า", exact: true }).click();
      await p.getByRole("button", { name: "ซูมออก", exact: true }).click();
      await p.getByRole("button", { name: "ดูทั้งฟาร์ม", exact: true }).click();
      await p.getByRole("button", { name: "กลับลาน", exact: true }).click();
      timings.push({ count, viewport: size, controlsMs: Date.now() - start });
      checks += 4;
      const region = p.getByRole("region", {
        name: "แผนที่ฟาร์มเกาะลอย เลื่อนเพื่อดูพื้นที่ข้างเคียง",
      });
      await region.evaluate((el) => {
        el.scrollLeft += 100;
        el.scrollTop += 100;
      });
      assert.ok(await region.evaluate((el) => el.scrollLeft > 0));
      checks++;
      await p.screenshot({
        path: `test-results/farm-phase4/layout${count}-${size.width}.png`,
        fullPage: true,
      });
    }
  }
  await p.setViewportSize({ width: 375, height: 667 });
  await p.goto("http://localhost:3107/collection/preview?kind=layout17");
  await p
    .getByLabel("ย้ายชิ้นที่มี", { exact: true })
    .selectOption("egg-storage");
  await p
    .getByRole("button", { name: "เลือกจุดวางคลังไข่ที่ 0, -1", exact: true })
    .click();
  await p.getByRole("button", { name: "ยืนยันย้าย", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "บันทึกผังแล้ว" }).waitFor();
  checks++;
  await p
    .getByLabel("ย้ายชิ้นที่มี", { exact: true })
    .selectOption("preview-place-10");
  await p
    .getByRole("button", { name: "เลือกจุดวางสะพานที่ 5, 1", exact: true })
    .click();
  await p.getByRole("button", { name: /หมุนสะพาน/ }).click();
  assert.equal(
    await p
      .getByRole("button", { name: "ยืนยันย้าย", exact: true })
      .isDisabled(),
    true,
  );
  checks++;
  assert.deepEqual(errors, []);
  checks++;
  fs.writeFileSync(
    "test-results/farm-phase4/metrics.json",
    JSON.stringify(
      {
        environment:
          "development mock route, local desktop browser, no real account",
        checks,
        timings,
      },
      null,
      2,
    ),
  );
  console.log(`Layout browser: ${checks} checks passed (synthetic only)`);
} finally {
  await b.close();
}
