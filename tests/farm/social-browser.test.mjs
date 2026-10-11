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
    await p.goto("http://localhost:3107/collection/preview?kind=social");
    await p.locator('[data-farm-camera-ready="true"]').waitFor();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    assert.equal(await p.getByRole("textbox").count(), 0);
    checks++;
    assert.equal(
      await p.getByRole("link", { name: "ย้ายพื้นที่ฟรี →" }).count(),
      0,
    );
    checks++;
    await p
      .getByRole("button", { name: /^ดูบ่อน้ำ \(/ })
      .first()
      .click();
    await p.getByRole("heading", { name: "บ่อน้ำ", exact: true }).waitFor();
    await p.getByText("คู่หูผู้สร้าง · หัวหน้าทีม", { exact: true }).waitFor();
    checks++;
    await p.getByRole("button", { name: "เก่งมาก", exact: false }).click();
    await p.getByRole("status").filter({ hasText: "การตอบกลับขาด" }).waitFor();
    checks++;
    assert.equal(
      await p
        .getByRole("button", { name: "เป็นกำลังใจให้", exact: false })
        .isDisabled(),
      true,
    );
    checks++;
    await p.getByRole("button", { name: "เก่งมาก", exact: false }).click();
    await p.getByRole("status").filter({ hasText: "วันนี้แล้ว" }).waitFor();
    const nonces = (
      await p.locator("[data-sticker-nonces]").textContent()
    ).split(" | ");
    assert.equal(nonces.length, 2);
    assert.equal(nonces[0], nonces[1]);
    checks++;
    assert.equal(
      await p
        .getByRole("button", { name: "เก่งมาก", exact: false })
        .isDisabled(),
      true,
    );
    checks++;
    await p.screenshot({
      path: `test-results/farm-phase8/social-${size.width}.png`,
      fullPage: true,
    });
  }
  console.log(
    `Friend farm browser: ${checks} checks passed; simulated accepted-but-response-lost sticker, no database`,
  );
} finally {
  await b.close();
}
