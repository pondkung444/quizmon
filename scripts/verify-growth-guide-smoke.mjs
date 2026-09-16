import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

const credentials = JSON.parse(await readFile("output/raid-clarity-2026-09-16/new-player-registered-credentials.json", "utf8"));
const output = "output/stage4-guidance";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto("http://127.0.0.1:3003/login");
  await page.screenshot({ path: `${output}/login-check.png` });
  const openLogin = page.getByRole("button", { name: /มีบัญชีอยู่แล้ว/ });
  if (await openLogin.count()) await openLogin.click();
  await page.getByLabel("อีเมล", { exact: true }).fill(credentials.email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL(/\/pet/);
  const guide = page.getByRole("region", { name: "เส้นทางเติบโตของ Qmon" });
  await expect(guide).toContainText("เป้าหมายต่อไป: Qmon Stage 4");
  await expect(guide).toContainText("พลังสะสมของ Qmon ไม่รีเซ็ต");
  await guide.locator("summary").click();
  await expect(guide).toContainText("900 EXP");
  await expect(guide).toContainText("ระหว่างนี้ทำภารกิจและฝึก Qmon ต่อได้");
  for (const width of [360, 375, 393, 412, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await guide.scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${output}/growth-${width}.png` });
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await guide.evaluate(element => {
    const nodes = [element, ...element.querySelectorAll("*")];
    const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
    nodes.forEach((node, index) => { node.style.fontSize = `${sizes[index] * 1.25}px`; });
  });
  expect(await guide.locator("summary").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await guide.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/growth-360-text125.png` });
  console.log(JSON.stringify({ viewports: 5, text125: "passed", growthGuide: "passed", accountChanges: false }));
} finally {
  await browser.close();
}
