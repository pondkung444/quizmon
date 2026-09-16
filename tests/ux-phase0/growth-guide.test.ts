import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(new URL("../../src/components/QmonGrowthGuide.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
}).outputText
  .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replace('"@/lib/evolution"', JSON.stringify(new URL("../../src/lib/evolution.ts", import.meta.url).href));
const { default: Guide } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("growth guide separates accumulated EXP from daily training", () => {
  const html = renderToStaticMarkup(createElement(Guide, { stage: 2, exp: 180, dailyCap: 180, advancedActivitiesUnlocked: false }));
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.doesNotMatch(html, /เป้าหมายต่อไป|เหลืออีก/);
  assert.match(html, /ไม่รีเซ็ตเมื่อขึ้นวันใหม่/);
  assert.match(html, /50 EXP/);
  assert.match(html, /350 EXP/);
  assert.match(html, /900 EXP/);
  assert.match(html, /ทำภารกิจก่อน/);
  assert.doesNotMatch(html, /href=/);
});

test("full grown Qmon explains collection before using unlocked modes", () => {
  const html = renderToStaticMarkup(createElement(Guide, { stage: 4, exp: 900, dailyCap: 180, advancedActivitiesUnlocked: true }));
  assert.match(html, /ดูเส้นทางการเติบโต/);
  assert.match(html, /เก็บ Qmon ตัวนี้เข้าฟาร์ม/);
  assert.match(html, /เลือก Qmon Stage 4 จากฟาร์ม/);
  assert.doesNotMatch(html, /เหลืออีก/);
});

test("over-threshold intermediate Qmon does not claim Stage 4 is reached", () => {
  const html = renderToStaticMarkup(createElement(Guide, { stage: 3, exp: 950, dailyCap: 180, advancedActivitiesUnlocked: true }));
  assert.match(html, /ถึงเกณฑ์ EXP แล้ว ฝึกต่อเพื่อขยับระยะ/);
  assert.doesNotMatch(html, /ถึง Stage 4 แล้ว!/);
  assert.match(html, /บัญชีนี้มีโหมดท้าทายและผจญภัยให้เล่นแล้ว/);
});
