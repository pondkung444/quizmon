import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farmNextStep } from '../../src/lib/farm/dashboard.ts';
import type { SchoolProject } from '../../src/lib/farm/school.ts';
const school: SchoolProject = { status: 'building', leader_id: 'mock', resume_status: null, ready_at: '2026-01-01T00:05:00Z', remaining_seconds: 0, round_deadline: null, failures: 0, penalty_applied: false, tile_x: null, tile_y: null };
test('new farm leads to first school', () => assert.equal(farmNextStep(null, [], 0).href, '/collection/school'));
test('overdue preparation leads to help without changing the stored project', () => { const next = farmNextStep(school, [], Date.parse('2026-01-01T00:06:00Z')); assert.match(next.title, /รอให้ช่วย/); assert.equal(school.status, 'building'); });
test('overdue finishing leads directly to school placement', () => assert.equal(farmNextStep({ ...school, status: 'finishing' }, [], Date.parse('2026-01-01T00:06:00Z')).href, '/collection?place=school'));
test('paused school keeps the resume path', () => assert.equal(farmNextStep({ ...school, status: 'paused' }, [], 0).title, 'กลับมาสร้างโรงเรียนต่อ'));
test('placed school introduces garden discovery', () => assert.equal(farmNextStep({ ...school, status: 'placed' }, [], 0).href, '/collection/school/learn'));

test("no available starter keeps the hatch-egg entry", () => assert.equal(farmNextStep(null, [], 0, false).href, "/eggs"));
