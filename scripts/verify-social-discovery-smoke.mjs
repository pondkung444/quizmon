import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFile, mkdir } from 'node:fs/promises';

// Only disposable UX accounts; credentials never enter reports or screenshots.
const baseURL = process.env.QUIZMON_SMOKE_BASE_URL;
if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseURL)) throw new Error('Use a local test server');
const paths = [process.env.QUIZMON_SOCIAL_ACCOUNT_A, process.env.QUIZMON_SOCIAL_ACCOUNT_B];
if (paths.some(path => !path)) throw new Error('Provide two disposable account files');
const accounts = [];
for (const path of paths) {
  const credentials = JSON.parse(await readFile(path, 'utf8'));
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new Error('Test account login failed');
  const { data: profile, error: profileError } = await client.from('profiles').select('username, friend_code').eq('id', data.user.id).single();
  if (profileError || !profile?.username?.startsWith('UX') || !profile.friend_code) throw new Error('Refusing non-UX account');
  accounts.push({ credentials, profile });
  await client.auth.signOut();
}
const output = 'output/social-discovery-2026-09-16';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/social/invite?code=${accounts[1].profile.friend_code}`);
  await expect(page).toHaveURL(/\/login$/);
  const invite = (await context.cookies()).find(cookie => cookie.name === 'qmon_friend_invite');
  if (!invite?.httpOnly || invite.sameSite !== 'Lax') throw new Error('Invite cookie safety failed');
  await page.getByRole('button', { name: /มีบัญชีอยู่แล้ว/ }).click();
  await page.getByLabel('อีเมล', { exact: true }).fill(accounts[0].credentials.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(accounts[0].credentials.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/social\/add-friend\?code=/, { timeout: 45000 });
  await expect(page.getByLabel('รหัสเพื่อน', { exact: true })).toHaveValue(accounts[1].profile.friend_code);
  await page.getByRole('button', { name: 'ชื่อเล่น', exact: true }).click();
  await page.getByLabel('ชื่อเล่นเพื่อน').fill(accounts[1].profile.username);
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page.getByText(accounts[1].profile.username, { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'ให้เพื่อนสแกน QR', exact: true }).click();
  const qr = page.getByAltText('QR เพิ่มเพื่อนของฉัน');
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);
  for (const width of [360, 375, 393, 412, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Overflow at ${width}`);
    await page.screenshot({ path: `${output}/friend-search-${width}.png`, fullPage: true });
  }
  console.log('PASS: local invite login continuation, exact name discovery, local QR and viewport overflow checks. No friendship or block mutations.');
} finally { await browser.close(); }
