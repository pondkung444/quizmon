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
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(size);
    await p.goto("http://localhost:3107/collection/preview?kind=catalogue");
    const pond = p
      .locator("section")
      .filter({
        has: p.getByRole("heading", {
          name: "บ่อน้ำ · 50 เหรียญ",
          exact: true,
        }),
      });
    await pond.getByRole("img", { name: "บ่อน้ำ", exact: true }).waitFor();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    await pond
      .getByLabel("หัวหน้าโครงการใหม่")
      .selectOption("00000000-0000-4000-8000-000000000001");
    const buy = pond.getByRole("button", { name: "เริ่มสร้าง 50 เหรียญ" });
    await buy.click();
    await p.getByRole("link", { name: "ไปเลือกพื้นที่ในฟาร์ม" }).waitFor();
    checks++;
    await buy.click();
    await p.waitForFunction(
      () =>
        document.querySelector("[data-team-events]").textContent.split(" | ")
          .length === 2,
    );
    const requests = (
      await p.locator("[data-team-events]").textContent()
    ).split(" | ");
    assert.notEqual(requests[0], requests[1]);
    checks++;
    assert.equal(await buy.isDisabled(), true);
    checks++;
    assert.equal(
      await p.getByRole("link", { name: "ไปเลือกพื้นที่ในฟาร์ม" }).count(),
      2,
    );
    checks++;
    const flowers = p
      .locator("section")
      .filter({
        has: p.getByRole("heading", {
          name: "แปลงดอกไม้ · 50 เหรียญ",
          exact: true,
        }),
      });
    assert.equal(
      await flowers
        .getByRole("button", { name: "เริ่มสร้าง 50 เหรียญ" })
        .isDisabled(),
      true,
    );
    checks++;
  }
  console.log(
    `Catalogue browser: ${checks} checks passed; synthetic instant-ready purchases, no database connection`,
  );
} finally {
  await b.close();
}
