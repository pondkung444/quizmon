import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

// Credentials remain local and never appear in output or screenshots of the form.
const credentialPath = process.env.QUIZMON_STAGE4_CREDENTIALS_FILE;
if (!credentialPath) throw new Error("Set QUIZMON_STAGE4_CREDENTIALS_FILE to a disposable test account file");
const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
const baseURL = process.env.QUIZMON_SMOKE_BASE_URL ?? "https://quizmon.xyz";
const output = "output/raid-clarity-2026-09-16";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(`${baseURL}/login`);
  await page.getByRole("button", { name: /มีบัญชีอยู่แล้ว/ }).click();
  await page.getByLabel("อีเมล").fill(credentials.email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL(/\/(pet|eggs)$/);
  for (const route of ["/collection", "/adventure", "/raid"]) {
    await page.goto(`${baseURL}${route}`);
    await expect(page.locator("body")).not.toHaveText("");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const text = await page.locator("main").innerText();
    await page.screenshot({ path: `${output}/stage4-${route.slice(1)}.png`, fullPage: true });
    console.log(JSON.stringify({ route, overflow, content: text.slice(0, 1600) }));
  }
} finally {
  await browser.close();
}
