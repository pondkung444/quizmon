import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch();
let checks = 0;
try {
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(120000);
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(size);
    await p.goto(
      "http://localhost:3107/collection/preview?kind=catalogue-endgame",
    );
    const bridge = p
      .locator("section")
      .filter({
        has: p.getByRole("heading", { name: "สะพาน · 90 เหรียญ", exact: true }),
      });
    const observer = p
      .locator("section")
      .filter({
        has: p.getByRole("heading", {
          name: "หอดูดาว · 150 เหรียญ",
          exact: true,
        }),
      });
    await bridge.getByRole("img", { name: "สะพาน", exact: true }).waitFor();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    for (const [card, price, quantity] of [
      [bridge, 90, 2],
      [observer, 150, 1],
    ]) {
      await card
        .getByLabel("หัวหน้าโครงการใหม่")
        .selectOption("00000000-0000-4000-8000-000000000001");
      for (let i = 0; i < quantity; i++) {
        await card
          .getByRole("button", { name: `เริ่มสร้าง ${price} เหรียญ` })
          .click();
        await card
          .getByText(`ครบเพดาน ${quantity} แห่งแล้ว`, { exact: true })
          .waitFor({ state: i === quantity - 1 ? "visible" : "hidden" });
        checks++;
      }
      assert.equal(
        await card
          .getByRole("button", { name: `เริ่มสร้าง ${price} เหรียญ` })
          .isDisabled(),
        true,
      );
      checks++;
    }
    assert.equal(
      await p.getByRole("link", { name: "ไปเลือกพื้นที่ในฟาร์ม" }).count(),
      3,
    );
    checks++;
    await p.screenshot({
      path: `test-results/farm-phase6/endgame-${size.width}.png`,
      fullPage: true,
    });
  }
  console.log(
    `Endgame browser: ${checks} checks passed, synthetic purchases only`,
  );
} finally {
  await b.close();
}
