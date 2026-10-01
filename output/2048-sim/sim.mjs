#!/usr/bin/env node
// QuizMon 2048 headless simulator. See README.md.
// usage: node sim.mjs [--seeds 200] [--policies random,greedy,greedy-egg] [--quiz-p 0.7] [--max-swipes 6000]
//                     [--forms substring] [--no-control] [--workers N] [--label name | --out dir] [--jsonl]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import { buildForms, DEFAULTS, HARNESS_RULES, POLICIES } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const hash = n => Math.imul(n + 1, 2654435761) >>> 0;

if (!isMainThread) {
  // ---------- worker ----------
  const { forestConfig } = await import(pathToFileURL(path.join(HERE, 'engine/stats.ts')).href);
  const read = f => fs.readFileSync(path.join(HERE, 'engine', f), 'utf8');
  const ctx = vm.createContext({ console, structuredClone, document: {}, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext([read('runes.js'), read('skills.js'), read('engine.js'), 'let state;', read('run.js')].join('\n'), ctx, { filename: 'engine-bundle.js' });
  vm.runInContext(fs.readFileSync(path.join(HERE, 'ctx-driver.js'), 'utf8'), ctx, { filename: 'ctx-driver.js' });
  const cfgCache = new Map();
  const out = [];
  for (const job of workerData.jobs) {
    const f = job.form;
    if (!cfgCache.has(f.form_id)) cfgCache.set(f.form_id, forestConfig(f.stats));
    const gameSeed = hash(job.seed);
    const botSeed = (gameSeed ^ Math.imul(POLICIES.indexOf(job.policy) + 1, 0x9E3779B1)) >>> 0;
    const res = ctx.__runOne({ egg: f.egg, stage: f.stage, lane: f.lane, personality: f.personality, config: cfgCache.get(f.form_id),
      policy: job.policy, gameSeed, botSeed, quizP: job.quizP, maxSwipes: job.maxSwipes });
    const id = `${f.form_id}|${job.policy}|${job.seed}`;
    const meta = { run_id: id, form_id: f.form_id, group: f.group, egg: f.egg, egg_name: f.egg_name, rarity: f.rarity, lane: f.lane,
      personality: f.personality, skill_index: f.skill_index ?? '', skill_name: f.skill_name ?? '', stage: f.stage, policy: job.policy,
      seed: job.seed, game_seed: gameSeed, quiz_p: job.quizP };
    out.push(JSON.parse(JSON.stringify({ run: { ...meta, ...res.row }, rooms: res.rooms.map(r => ({ run_id: id, form_id: f.form_id, policy: job.policy, seed: job.seed, ...r })),
      events: res.events.map(e => ({ run_id: id, form_id: f.form_id, policy: job.policy, seed: job.seed, ...e })) })));
    if (out.length >= 200) { parentPort.postMessage({ batch: out.splice(0) }); }
  }
  parentPort.postMessage({ batch: out, done: true });
} else {
  // ---------- main ----------
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : args[i + 1]; };
  const seeds = +opt('seeds', DEFAULTS.seeds);
  const policies = opt('policies', DEFAULTS.policies.join(',')).split(',');
  const quizP = +opt('quiz-p', DEFAULTS.quizP);
  const maxSwipes = +opt('max-swipes', DEFAULTS.maxSwipes);
  const filter = opt('forms', '');
  const control = !args.includes('--no-control');
  const nWorkers = +opt('workers', Math.max(1, Math.min(os.cpus().length - 1, 12)));
  const label = opt('label', `run-${new Date().toISOString().slice(0, 10)}`);
  const outDir = path.resolve(opt('out', path.join(HERE, 'results', label)));
  for (const p of policies) if (!POLICIES.includes(p)) throw new Error('unknown policy ' + p);

  const forms = buildForms({ control }).filter(f => f.form_id.includes(filter));
  const jobs = [];
  for (const form of forms) for (const policy of policies) for (let seed = 0; seed < seeds; seed++) jobs.push({ form, policy, seed, quizP, maxSwipes });
  console.log(`forms=${forms.length} policies=${policies.length} seeds=${seeds} -> ${jobs.length} runs on ${nWorkers} workers`);

  const t0 = Date.now(), results = [];
  const chunks = Array.from({ length: nWorkers }, () => []);
  jobs.forEach((j, i) => chunks[i % nWorkers].push(j));
  await Promise.all(chunks.filter(c => c.length).map(jobsChunk => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: jobsChunk } });
    w.on('message', m => { results.push(...m.batch); process.stdout.write(`\r${results.length}/${jobs.length}`); if (m.done) resolve(); });
    w.on('error', reject);
    w.on('exit', c => { if (c) reject(new Error('worker exit ' + c)); });
  })));
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  results.sort((a, b) => a.run.run_id < b.run.run_id ? -1 : 1);
  fs.mkdirSync(outDir, { recursive: true });
  const csv = rows => {
    if (!rows.length) return '';
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const esc = v => { v = v === undefined || v === null ? '' : Array.isArray(v) ? v.join('|') : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + cols.join(',') + '\n' + rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n') + '\n';
  };
  fs.writeFileSync(path.join(outDir, 'runs.csv'), csv(results.map(r => r.run)));
  fs.writeFileSync(path.join(outDir, 'rooms.csv'), csv(results.flatMap(r => r.rooms)));
  fs.writeFileSync(path.join(outDir, 'relic_events.csv'), csv(results.flatMap(r => r.events)));
  if (args.includes('--jsonl')) fs.writeFileSync(path.join(outDir, 'runs.jsonl'), results.map(r => JSON.stringify(r)).join('\n') + '\n'); // optional nested run+rooms+events (~90MB per 25k runs)
  const source = JSON.parse(fs.readFileSync(path.join(HERE, 'engine/SOURCE.json'), 'utf8'));
  fs.writeFileSync(path.join(outDir, 'run-config.json'), JSON.stringify({
    generated_at: new Date().toISOString(), node: process.version, elapsed_seconds: +((Date.now() - t0) / 1000).toFixed(1),
    command: process.argv.slice(1).join(' '), parameters: { seeds, policies, quizP, maxSwipes, filter, control, secondsPerSwipe: DEFAULTS.secondsPerSwipe, secondsPerNonBattleRoom: DEFAULTS.secondsPerNonBattleRoom },
    engine_source: source, rules: HARNESS_RULES, forms, total_runs: results.length,
  }, null, 2));
  console.log('wrote', outDir);
}
