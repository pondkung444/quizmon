import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('test-results/farm-ui',{recursive:true});
const browser=await chromium.launch();const base=process.env.FARM_TEST_URL??'http://localhost:3107';let checks=0;
try{for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
const page=await browser.newPage({viewport});page.setDefaultNavigationTimeout(120000);
await page.goto(base+'/collection/preview?kind=catalogue-failure');
const card=page.locator('section').filter({has:page.getByRole('heading',{name:'บ่อน้ำ · 50 เหรียญ',exact:true})});
await card.getByLabel('หัวหน้าโครงการใหม่').selectOption('00000000-0000-4000-8000-000000000001');
const buy=card.getByRole('button',{name:'เริ่มสร้าง 50 เหรียญ'});await buy.click();const dialog=page.getByRole('dialog');
await dialog.getByText('450 เหรียญ',{exact:true}).waitFor();assert.equal(await page.locator('[data-team-events]').textContent(),'');checks++;
await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('[data-team-events]').textContent(),'');checks++;
await buy.click();await dialog.getByRole('button',{name:/ยืนยันเริ่มงาน/}).click();await dialog.getByRole('alert').waitFor();const committed=await page.locator('[data-team-events]').textContent();assert.ok(committed);checks++;
const errorBounds=await dialog.getByRole('alert').boundingBox();const retryBounds=await dialog.getByRole('button',{name:/ยืนยันเริ่มงาน/}).boundingBox();assert.ok(errorBounds.y>=0 && errorBounds.y+errorBounds.height<=viewport.height);assert.ok(retryBounds.y>=0 && retryBounds.y+retryBounds.height<=viewport.height);checks++;
await page.screenshot({path:'test-results/farm-ui/confirmation-'+viewport.width+'.png'});
await dialog.getByRole('button',{name:/ยืนยันเริ่มงาน/}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('[data-team-events]').textContent(),committed);checks++;
await page.getByText('เหรียญฟาร์ม 450 เหรียญ',{exact:true}).waitFor();checks++;
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
await page.goto(base+'/collection/preview?kind=ui-home');await page.getByRole('heading',{name:'สร้างโรงเรียนหลังแรก'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
await page.close();
}console.log('Farm UI review: '+checks+' checks passed; synthetic data only');}finally{await browser.close();}
