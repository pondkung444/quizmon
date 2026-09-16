import { chromium, expect } from "@playwright/test";
import { mkdir, access, readFile } from "node:fs/promises";

const baseURL = process.env.QUIZMON_SMOKE_BASE_URL;
if (!baseURL) throw new Error("Set QUIZMON_SMOKE_BASE_URL to the dev/test environment");
const output = "output/raid-clarity-2026-09-16";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const authPath = `${output}/new-player-auth.json`;
const hasSavedAuth = await access(authPath).then(() => true, () => false);
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ...(hasSavedAuth ? { storageState: authPath } : {}) });
try {
  const page = await context.newPage();
  let roundAnswers = [];
  // Practice already sends its answer key to the client. Use that same response
  // to exercise normal UI submissions without changing rewards or database rows.
  function readQuestions(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value) && value.length && value.every(item => Number.isInteger(item?.correctIndex))) {
      roundAnswers = value.map(item => item.correctIndex);
    }
    for (const item of Object.values(value)) readQuestions(item);
  }
  page.on("response", async response => {
    if (!response.request().headers()["next-action"]) return;
    try {
      for (const line of (await response.text()).split("\n")) {
        const json = line.slice(line.indexOf(":") + 1);
        try { readQuestions(JSON.parse(json)); } catch { /* Other Flight records. */ }
      }
    } catch { /* Redirect responses contain no questions. */ }
  });
  if (!hasSavedAuth) {
  await page.goto(`${baseURL}/guest`);
  await page.getByLabel("ชื่อที่ใช้แสดง").fill(`UXP3${Date.now().toString().slice(-8)}`);
  await page.getByLabel("ระดับชั้น").selectOption("ม.3");
  await page.getByRole("button", { name: "เริ่มเลย", exact: true }).click();
  await page.waitForURL(/\/eggs$/);
  await page.getByRole("button", { name: "ฟักไข่นี้", exact: true }).first().click();
  await page.getByRole("textbox", { name: "ตั้งชื่อ Qmon", exact: true }).fill("UX ฝึกครบวัน");
  await page.getByRole("button", { name: "ฟักไข่", exact: true }).click();
  await page.waitForURL(/\/pet/);
  await context.storageState({ path: authPath });
  } else {
    const credentialPath = `${output}/new-player-registered-credentials.json`;
    if (await access(credentialPath).then(() => true, () => false)) {
      const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
      await context.clearCookies();
      await page.goto(`${baseURL}/login`);
      await page.getByRole("button", { name: /มีบัญชีอยู่แล้ว/ }).click();
      await page.getByLabel("อีเมล", { exact: true }).fill(credentials.email);
      await page.getByLabel("รหัสผ่าน", { exact: true }).fill(credentials.password);
      await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
      await page.waitForURL(/\/pet/);
    }
    await page.goto(`${baseURL}/pet`);
  }
  const mission = page.getByRole("region", { name: "ทำภารกิจวันนี้ต่อ" });
  const missionPending = await mission.count();
  if (missionPending) {
  await expect(mission).toBeVisible();
  await mission.locator("summary").click();
  await expect(mission).toContainText("ปลดล็อกเมื่อมี Qmon Stage 4");
  await expect(page.getByRole("link", { name: "ผจญภัย", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "ท้าทายด่าน", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${output}/new-player-mission-first.png`, fullPage: true });
  await mission.getByRole("link", { name: "เริ่มภารกิจ", exact: true }).click();
  }

  async function playRound() {
    let answered = 0;
    while (answered < 5) {
      const heading = page.locator(".quiz-question-card h2");
      await expect(heading).toBeVisible();
      await expect.poll(() => roundAnswers.length).toBe(5);
      await page.getByTestId("choice-button").nth(roundAnswers[answered]).click();
      await page.getByRole("button", { name: answered === 4 ? "ถึงปลายทาง · ดูสรุป" : "ไปต่อ →", exact: true }).click();
      answered++;
    }
    return answered;
  }
  let answered = 0;
  if (missionPending) {
  answered = await playRound();
  await expect(page.getByRole("heading", { name: "เลือกอาหารให้ Qmon" })).toBeVisible();
  await page.getByRole("button", { name: /ผลึกพลัง/ }).click();
  await expect(page.getByRole("heading", { name: "ทำภารกิจวันนี้ครบแล้ว!" })).toBeVisible();
  const feedbackClose = page.getByRole("button", { name: "ปิด", exact: true });
  if (await feedbackClose.isVisible()) await feedbackClose.click();
  await page.getByRole("button", { name: "กลับไปหา Qmon", exact: true }).click();
  await page.waitForURL(/\/pet/);
  }
  const training = page.getByRole("region", { name: "ฝึก Qmon ต่อให้เต็ม" });
  if (await training.count()) await page.screenshot({ path: `${output}/new-player-training-next.png`, fullPage: true });
  for (let round = 0; round < 6 && await training.count(); round++) {
    roundAnswers = [];
    await training.getByRole("link", { name: "ฝึก Qmon ต่อ", exact: true }).click();
    await page.getByRole("button", { name: /คณิตศาสตร์/ }).click();
    answered += await playRound();
    await expect(page.getByRole("heading", { name: "จบรอบแล้ว!" })).toBeVisible();
    await page.getByRole("button", { name: "ไปเลี้ยง Qmon", exact: true }).click();
    await page.waitForURL(/\/pet/);
    if (!(await training.count())) break;
  }
  await expect(page.locator("main")).toContainText("180 / 180 แต้ม");
  await expect(training).toHaveCount(0);
  await page.reload();
  await expect(page.locator("main")).toContainText("180 / 180 แต้ม");
  await expect(page.getByRole("link", { name: "ท้าทายด่าน", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${output}/new-player-daily-cap.png`, fullPage: true });
  await expect(page.getByRole("region", { name: "Qmon ฝึกเต็มแล้ววันนี้" })).toContainText("ทบทวนเพิ่มไม่ให้ EXP");
  // A slow CTA navigation must survive clearing the short evolution animation marker.
  await page.goto(`${baseURL}/pet?evolved=1`);
  await page.route(/\/quiz(?:\?|$)/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.getByRole("region", { name: "Qmon ฝึกเต็มแล้ววันนี้" }).getByRole("link", { name: "ทบทวนเพิ่มเติม", exact: true }).click();
  await page.waitForURL(/\/quiz$/);
  await expect(page.getByRole("button", { name: /คณิตศาสตร์/ })).toBeVisible();
  console.log(JSON.stringify({ missionFirst: true, trainingAfterMission: true, dailyExp: 180, answeredThisRun: answered, capSurvivesReload: true, advancedActivitiesLocked: true, slowEvolutionNavigation: "passed" }));
} finally {
  await browser.close();
}
