#!/usr/bin/env node
// usage: node summarize.mjs results/<label> [--compare results/other1,results/other2]
// Reads runs.csv / rooms.csv / relic_events.csv / run-config.json, writes <dir>/summary/*.csv and <dir>/REPORT.md
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '');
const cmpIdx = process.argv.indexOf('--compare');
const compareDirs = cmpIdx > 0 ? process.argv[cmpIdx + 1].split(',').map(d => path.resolve(d)) : [];
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'run-config.json'), 'utf8'));
const [SPS_LO, SPS_HI] = cfg.parameters.secondsPerSwipe, SEC_NB = cfg.parameters.secondsPerNonBattleRoom;
const STAG_HP = 1200;

// ---------- csv ----------
function readCsv(file) {
  let t = fs.readFileSync(file, 'utf8'); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...b] = rows;
  return b.filter(r => r.length === h.length).map(r => { const o = {}; h.forEach((k, i) => { const v = r[i]; o[k] = v !== '' && /^-?\d+(\.\d+)?$/.test(v) ? +v : v; }); return o; });
}
const writeCsv = (name, rows) => {
  fs.mkdirSync(path.join(dir, 'summary'), { recursive: true });
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = v => { v = v === undefined || v === null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(4)) : String(v); v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  fs.writeFileSync(path.join(dir, 'summary', name), '﻿' + cols.join(',') + '\n' + rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n') + '\n');
};

// ---------- stats ----------
const sum = a => a.reduce((x, y) => x + y, 0);
const mean = a => a.length ? sum(a) / a.length : NaN;
const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); };
const q = (s, p) => { if (!s.length) return NaN; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
function wilson(k, n) { if (!n) return [NaN, NaN]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; }
function desc(a, pre) {
  const s = [...a].sort((x, y) => x - y), m = mean(a), h = a.length ? 1.96 * sd(a) / Math.sqrt(a.length) : NaN;
  return { [pre + '_n']: a.length, [pre + '_mean']: m, [pre + '_ci_lo']: m - h, [pre + '_ci_hi']: m + h, [pre + '_min']: s[0] ?? NaN, [pre + '_p10']: q(s, .1), [pre + '_median']: q(s, .5), [pre + '_p90']: q(s, .9), [pre + '_max']: s[s.length - 1] ?? NaN };
}
const rate = (rows, pred, pre) => { const k = rows.filter(pred).length, [lo, hi] = wilson(k, rows.length); return { [pre]: rows.length ? k / rows.length : NaN, [pre + '_lo']: lo, [pre + '_hi']: hi, [pre + '_k']: k }; };
const groupBy = (rows, keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
const pct = x => Number.isFinite(x) ? (100 * x).toFixed(1) + '%' : '–';
const num = (x, d = 1) => Number.isFinite(x) ? (+x).toFixed(d) : '–';
const md = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map(r => `| ${r.join(' | ')} |`).join('\n') + '\n';

// ---------- load ----------
const runs = readCsv(path.join(dir, 'runs.csv'));
const rooms = readCsv(path.join(dir, 'rooms.csv'));
const events = readCsv(path.join(dir, 'relic_events.csv'));
const minutes = (r, sps) => (r.swipes * sps + (r.nonbattle_rooms + r.revive_used) * SEC_NB) / 60;

// ---------- validation ----------
const roomsByRun = groupBy(rooms, r => r.run_id);
const validation = [];
const chk = (name, ok, detail = '') => validation.push({ name, ok, detail });
chk('every run finished with win/loss (no timeout/stuck/guard/bad_phase)', runs.every(r => r.outcome === 'win' || r.outcome === 'loss'), JSON.stringify(Object.fromEntries([...groupBy(runs, r => r.outcome)].map(([k, v]) => [k, v.length]))));
chk('runs.swipes == sum(rooms.moves) for every run', runs.every(r => sum((roomsByRun.get(r.run_id) ?? []).map(x => x.moves)) === r.swipes));
chk('skill_dmg <= total_dmg and ord_dmg >= 0', runs.every(r => r.skill_dmg <= r.total_dmg && r.ord_dmg >= 0));
chk('control group never casts Auto', runs.filter(r => r.group !== 'stage4').every(r => r.casts === 0));
chk('stage-4 forms cast at least once in >=90% of runs', runs.filter(r => r.group === 'stage4').filter(r => r.casts > 0).length / runs.filter(r => r.group === 'stage4').length >= .9);
chk('no run lost with 0 recorded death', runs.filter(r => r.outcome === 'loss').every(r => r.first_death_room !== ''));
chk('roots only appear when the stag was reached', runs.every(r => r.stag_reached === 1 || r.roots_applied === 0));
chk('roots_released <= root_hits', runs.every(r => r.roots_released <= r.root_hits));
chk('runs per (form,policy) equal', new Set([...groupBy(runs, r => r.form_id + '|' + r.policy)].map(([, v]) => v.length)).size === 1);

// ---------- per form x policy ----------
function describeRuns(rs) {
  const wins = rs.filter(r => r.outcome === 'win'), losses = rs.filter(r => r.outcome === 'loss');
  const o = { n_runs: rs.length, ...rate(rs, r => r.outcome === 'win', 'win_rate') };
  for (let n = 1; n <= 8; n++) o['lose_final_r' + n] = rs.filter(r => r.outcome === 'loss' && r.final_room === n).length / rs.length;
  for (let n = 1; n <= 8; n++) o['first_death_r' + n] = rs.filter(r => r.first_death_room === n).length / rs.length;
  o.revive_used_rate = mean(rs.map(r => r.revive_used > 0 ? 1 : 0));
  const used = rs.filter(r => r.revive_used > 0); o.revive_success_given_used = used.length ? used.filter(r => r.revive_success > 0).length / used.length : NaN;
  Object.assign(o, desc(rs.map(r => r.swipes), 'swipes'), desc(wins.map(r => r.swipes), 'swipes_win'));
  Object.assign(o, desc(rs.map(r => minutes(r, SPS_LO)), 'min_lo'), desc(rs.map(r => minutes(r, SPS_HI)), 'min_hi'));
  Object.assign(o, desc(wins.map(r => minutes(r, SPS_LO)), 'min_lo_win'), desc(wins.map(r => minutes(r, SPS_HI)), 'min_hi_win'));
  o.min_target_hit_win_rate = wins.length ? wins.filter(r => minutes(r, SPS_LO) <= 15 && minutes(r, SPS_HI) >= 10).length / wins.length : NaN; // winners whose [lo,hi] overlaps 10-15min
  for (let n = 1; n <= 8; n++) o['swipes_median_r' + n] = q(rs.map(r => r['swipes_r' + n]).filter(v => v !== '').sort((a, b) => a - b), .5);
  const totalSw = sum(rs.map(r => r.swipes));
  o.jam_run_rate = mean(rs.map(r => r.jam_events > 0 ? 1 : 0)); o.jam_events_per_run = mean(rs.map(r => r.jam_events));
  o.jam_swipe_frac = sum(rs.map(r => r.jam_events)) / totalSw; o.jam_hp_lost_mean = mean(rs.map(r => r.jam_hp_lost));
  o.enemy_hp_lost_mean = mean(rs.map(r => r.enemy_hp_lost)); o.jam_share_of_hp_loss = sum(rs.map(r => r.jam_hp_lost)) / (sum(rs.map(r => r.jam_hp_lost)) + sum(rs.map(r => r.enemy_hp_lost)) || 1);
  Object.assign(o, desc(rs.map(r => r.casts), 'casts')); o.casts_per_100_swipes = 100 * sum(rs.map(r => r.casts)) / totalSw;
  for (const k of ['skill_dmg', 'ord_dmg', 'skill_armor', 'ord_armor', 'skill_heal', 'ord_heal', 'armor_blocked']) o[k + '_mean'] = mean(rs.map(r => r[k]));
  o.skill_dmg_share = sum(rs.map(r => r.skill_dmg)) / (sum(rs.map(r => r.total_dmg)) || 1);
  o.skill_armor_share = sum(rs.map(r => r.skill_armor)) / ((sum(rs.map(r => r.skill_armor)) + sum(rs.map(r => r.ord_armor))) || 1);
  o.skill_heal_share = sum(rs.map(r => r.skill_heal)) / ((sum(rs.map(r => r.skill_heal)) + sum(rs.map(r => r.ord_heal))) || 1);
  const st = rs.filter(r => r.stag_reached === 1), stl = st.filter(r => r.stag_result !== 'won');
  o.stag_reached_rate = st.length / rs.length; o.stag_win_given_reached = st.length ? st.filter(r => r.stag_result === 'won').length / st.length : NaN;
  Object.assign(o, desc(stl.map(r => r.stag_enemy_hp_left / STAG_HP), 'stag_hp_left_frac_at_loss'));
  o.stag_runs = st.length; o.roots_applied_per_stag_run = mean(st.map(r => r.roots_applied)); o.root_hits_per_stag_run = mean(st.map(r => r.root_hits)); o.roots_released_per_stag_run = mean(st.map(r => r.roots_released));
  o.root_release_ratio = sum(st.map(r => r.roots_released)) / (sum(st.map(r => r.roots_applied)) || 1);
  return o;
}
const meta = r => ({ form_id: r.form_id, group: r.group, egg: r.egg, egg_name: r.egg_name, rarity: r.rarity, lane: r.lane, personality: r.personality, skill_name: r.skill_name, policy: r.policy });
const formPolicy = [...groupBy(runs, r => r.form_id + '|' + r.policy)].map(([, rs]) => ({ ...meta(rs[0]), ...describeRuns(rs) }));
writeCsv('by_form_policy.csv', formPolicy);

const agg = (keys, filter = () => true, name) => {
  const rowsOut = [...groupBy(runs.filter(filter), r => keys.map(k => r[k]).join('|'))].map(([, rs]) => ({ ...Object.fromEntries(keys.map(k => [k, rs[0][k]])), ...describeRuns(rs) }));
  if (name) writeCsv(name, rowsOut); return rowsOut;
};
const byRarity = agg(['rarity', 'policy'], r => r.group === 'stage4', 'by_rarity_policy.csv');
const byEgg = agg(['egg', 'egg_name', 'rarity', 'policy'], r => r.group === 'stage4', 'by_egg_policy.csv');
const byLane = agg(['lane', 'policy'], r => r.group === 'stage4', 'by_lane_policy.csv');
agg(['egg', 'lane', 'policy'], r => r.group === 'stage4', 'by_egg_lane_policy.csv');
agg(['personality', 'policy'], r => r.group === 'stage4', 'by_personality_policy.csv');
agg(['policy'], r => r.group === 'stage4', 'by_policy_stage4.csv');
const stageCmp = [];
for (const [egg, e] of Object.entries(Object.fromEntries(runs.map(r => [r.egg, r])))) for (const policy of cfg.parameters.policies) {
  const a = runs.filter(r => r.egg === egg && r.policy === policy && r.group === 'stage4'), c = runs.filter(r => r.egg === egg && r.policy === policy && r.group !== 'stage4');
  if (!a.length || !c.length) continue;
  const da = describeRuns(a), dc = describeRuns(c);
  stageCmp.push({ egg, egg_name: e.egg_name, rarity: e.rarity, policy, stage4_win_rate: da.win_rate, stage4_lo: da.win_rate_lo, stage4_hi: da.win_rate_hi, control_win_rate: dc.win_rate, control_lo: dc.win_rate_lo, control_hi: dc.win_rate_hi,
    stage4_swipes_median: da.swipes_median, control_swipes_median: dc.swipes_median, stage4_stat_note: 'stage4 = avg of 6 forms with egg avg stats; control = stage 1-3 fallback stats 50, no Auto' });
}
writeCsv('stage_compare.csv', stageCmp);

// ---------- per room ----------
const runMeta = new Map(runs.map(r => [r.run_id, r]));
const roomRows = [...groupBy(rooms, r => r.form_id + '|' + r.policy + '|' + r.room)].map(([, rs]) => {
  const m = runMeta.get(rs[0].run_id), mv = rs.map(r => r.moves);
  return { form_id: m.form_id, group: m.group, egg: m.egg, rarity: m.rarity, lane: m.lane, personality: m.personality, policy: m.policy, room: rs[0].room, enemy_types: [...new Set(rs.map(r => r.enemy))].join('|'),
    runs_reached: rs.length, runs_total: runs.filter(r => r.form_id === m.form_id && r.policy === m.policy).length > 0 ? undefined : undefined,
    died_at_least_once_rate: rs.filter(r => r.deaths_in_room > 0).length / rs.length, final_loss_rate: rs.filter(r => r.result === 'lost').length / rs.length,
    ...desc(mv, 'moves'), hp_end_mean: mean(rs.map(r => r.hp_end)), jam_events_mean: mean(rs.map(r => r.jam_events)), casts_mean: mean(rs.map(r => r.casts)), enemy_hp_lost_mean: mean(rs.map(r => r.enemy_hp_lost)) };
});
for (const r of roomRows) delete r.runs_total;
writeCsv('by_room_form_policy.csv', roomRows);
const roomAgg = [...groupBy(rooms.map(r => ({ ...r, ...pick(runMeta.get(r.run_id), ['group', 'egg', 'rarity', 'policy']) })).filter(r => r.group === 'stage4'), r => r.policy + '|' + r.room)].map(([, rs]) => ({
  policy: rs[0].policy, room: rs[0].room, runs_reached: rs.length, died_at_least_once_rate: rs.filter(r => r.deaths_in_room > 0).length / rs.length, final_loss_rate: rs.filter(r => r.result === 'lost').length / rs.length, ...desc(rs.map(r => r.moves), 'moves') }));
function pick(o, ks) { return Object.fromEntries(ks.map(k => [k, o[k]])); }
writeCsv('by_room_policy_stage4.csv', roomAgg.sort((a, b) => a.policy < b.policy ? -1 : a.policy > b.policy ? 1 : a.room - b.room));

// ---------- relics ----------
const RELICS = ['echo', 'shadow', 'spark', 'seed', 'thorn', 'root'];
const stage4 = runs.filter(r => r.group === 'stage4');
const relicOwn = [], relicEarly = [], pickRows = [];
const earlyPicks = new Map(); // run_id -> Set of relics bought/picked at room<=4
for (const e of events) { if (e.room <= 4 && e.source !== 'shop') { if (!earlyPicks.has(e.run_id)) earlyPicks.set(e.run_id, new Set()); String(e.picked).split('|').filter(Boolean).forEach(p => earlyPicks.get(e.run_id).add(p)); } }
const cleared4 = new Set(rooms.filter(r => r.room === 4 && r.result === 'won').map(r => r.run_id));
for (const policy of [...cfg.parameters.policies, 'ALL']) for (const egg of ['ALL', ...Object.keys(Object.fromEntries(stage4.map(r => [r.egg, 1])))]) {
  const base = stage4.filter(r => (policy === 'ALL' || r.policy === policy) && (egg === 'ALL' || r.egg === egg));
  for (const rel of RELICS) {
    const own = base.filter(r => String(r.relics).split('|').includes(rel)), no = base.filter(r => !String(r.relics).split('|').includes(rel));
    const wo = rate(own, r => r.outcome === 'win', 'win'), wn = rate(no, r => r.outcome === 'win', 'win');
    relicOwn.push({ policy, egg, relic: rel, runs_with: own.length, win_with: wo.win, win_with_lo: wo.win_lo, win_with_hi: wo.win_hi, runs_without: no.length, win_without: wn.win, win_without_lo: wn.win_lo, win_without_hi: wn.win_hi, diff: wo.win - wn.win,
      caveat: 'BIASED by survivorship: later relics only exist in runs that survived long enough. Use relic_effect_early.csv for the fair comparison.' });
    const c4 = base.filter(r => cleared4.has(r.run_id)), ow = c4.filter(r => earlyPicks.get(r.run_id)?.has(rel)), nw = c4.filter(r => !earlyPicks.get(r.run_id)?.has(rel));
    const eo = rate(ow, r => r.outcome === 'win', 'win'), en = rate(nw, r => r.outcome === 'win', 'win');
    relicEarly.push({ policy, egg, relic: rel, runs_cleared_r4_with: ow.length, win_with: eo.win, win_with_lo: eo.win_lo, win_with_hi: eo.win_hi, runs_cleared_r4_without: nw.length, win_without: en.win, win_without_lo: en.win_lo, win_without_hi: en.win_hi, diff: eo.win - en.win,
      note: 'only runs that cleared room 4; "with" = picked at room 2/4 reward (random offer+random pick => no selection bias). Later-room relics still vary between groups (noise, not bias).' });
  }
}
writeCsv('relic_ownership_naive.csv', relicOwn); writeCsv('relic_effect_early.csv', relicEarly);
for (const [key, es] of groupBy(events.filter(e => runMeta.get(e.run_id)?.group === 'stage4'), e => e.source + '|' + e.policy)) {
  for (const rel of RELICS) { const offered = es.filter(e => String(e.offered).split('|').includes(rel)).length, picked = es.filter(e => String(e.picked).split('|').includes(rel)).length;
    pickRows.push({ source: es[0].source, policy: es[0].policy, relic: rel, times_offered: offered, times_picked: picked, pick_rate: offered ? picked / offered : NaN, note: 'bot picks uniformly at random, so pick_rate only reflects offer mix/shop affordability, not preference' }); }
}
writeCsv('relic_offers_picks.csv', pickRows);

// ---------- sensitivity ----------
let sens = [];
if (compareDirs.length) {
  const sets = [[`p${cfg.parameters.quizP}`, runs], ...compareDirs.map(d => { const c = JSON.parse(fs.readFileSync(path.join(d, 'run-config.json'), 'utf8')); return [`p${c.parameters.quizP}`, readCsv(path.join(d, 'runs.csv'))]; })];
  for (const [form, policy] of [...new Set(runs.map(r => r.form_id + '|' + r.policy))].map(s => s.split('|'))) {
    const row = { form_id: form, policy };
    for (const [label, rs] of sets) { const sub = rs.filter(r => r.form_id === form && r.policy === policy); const w = rate(sub, r => r.outcome === 'win', 'w'); row['win_' + label] = w.w; row['win_' + label + '_lo'] = w.w_lo; row['win_' + label + '_hi'] = w.w_hi; row['swipes_median_' + label] = q(sub.map(r => r.swipes).sort((a, b) => a - b), .5); }
    sens.push(row);
  }
  writeCsv('sensitivity_quiz_p.csv', sens);
}

// ---------- REPORT.md ----------
const ci = (r, k = 'win_rate') => `${pct(r[k])} (${pct(r[k + '_lo'])}–${pct(r[k + '_hi'])})`;
const P = cfg.parameters.policies;
let md_ = `# QuizMon 2048 — simulation report\n\n`;
md_ += `- Generated: ${cfg.generated_at} · node ${cfg.node} · ${cfg.total_runs} runs in ${cfg.elapsed_seconds}s\n- Engine: ${cfg.engine_source.repo} @ \`${cfg.engine_source.commit}\` (main, merge #264) — files vendored in \`engine/\` with SHA-256 in \`engine/SOURCE.json\`\n`;
md_ += `- Parameters: seeds/form/policy = ${cfg.parameters.seeds}, policies = ${P.join(', ')}, quiz P(correct) = ${cfg.parameters.quizP}, max swipes/run = ${cfg.parameters.maxSwipes}\n- Command: \`${cfg.command}\`\n- Win-rate intervals are Wilson 95%; means use normal-approx 95% CI (n≈200/cell); every CSV also carries min/p10/median/p90/max.\n\n`;
md_ += `## ⚠️ Limitations (read first)\n\n1. **This is bot data, not balance evidence.** Notion says bot/staged results must not be treated as proof that balance passes. Bots do not plan, never use the board the way an owner does, and the three policies bracket skill rather than model it.\n2. Stats are the Stage-4 **averages per egg** (no ±12% spread, no gear, no cap clipping), not any real Qmon.\n3. Quizzes are simulated: each question is right with P=${cfg.parameters.quizP}; sensitivity at other P in \`summary/sensitivity_quiz_p.csv\` (if generated). Question content/images are not modelled.\n4. Time is **estimated** from swipe counts: ${SPS_LO}–${SPS_HI} s/swipe + ${SEC_NB} s per non-battle room/revive. Real animation, reading and thinking time are unknown.\n5. Relic choice / doors are uniformly random on purpose. The naive “win rate when owning relic X” is biased by survivorship; use \`relic_effect_early.csv\`.\n6. Skill/armor attribution is gross (armor is not “armor actually used”); \`ord_dmg\` includes rune burn, quake counter and thorn. See \`run-config.json\` → \`rules.attribution\`.\n7. Nothing here changes locked rules; engine-vs-design observations are in \`FINDINGS-engine-vs-design.md\`.\n\n`;
md_ += `## Validation of the harness\n\n` + md(['check', 'result', 'detail'], validation.map(v => [v.name, v.ok ? '✅' : '❌ FAIL', v.detail])) + '\n';

md_ += `## 1. Win rate by rarity × policy (Stage 4, 36 forms pooled)\n\n` + md(['rarity', ...P], ['Common', 'Rare', 'Epic', 'Legendary'].map(ra => [ra, ...P.map(p => { const r = byRarity.find(x => x.rarity === ra && x.policy === p); return r ? ci(r) : '–'; })]));
md_ += `\n## 2. Win rate by egg × policy\n\n` + md(['egg', 'rarity', ...P], [...new Map(byEgg.map(r => [r.egg, r]))].map(([egg, r0]) => [`${r0.egg_name} (${egg})`, r0.rarity, ...P.map(p => { const r = byEgg.find(x => x.egg === egg && x.policy === p); return r ? ci(r) : '–'; })]));
md_ += `\n## 3. Stage comparison (Stage 4 with Auto vs Stage 1–3 fallback, no Auto)\n\n` + md(['egg', 'policy', 'Stage 4 (36→6 forms)', 'Stage 1–3 control', 'median swipes S4 / ctrl'], stageCmp.map(r => [r.egg_name, r.policy, `${pct(r.stage4_win_rate)} (${pct(r.stage4_lo)}–${pct(r.stage4_hi)})`, `${pct(r.control_win_rate)} (${pct(r.control_lo)}–${pct(r.control_hi)})`, `${num(r.stage4_swipes_median, 0)} / ${num(r.control_swipes_median, 0)}`]));
md_ += `\n## 4. Win rate by lane × policy (Stage 4)\n\n` + md(['lane', ...P], ['math', 'science', 'balanced'].map(l => [l, ...P.map(p => { const r = byLane.find(x => x.lane === l && x.policy === p); return r ? ci(r) : '–'; })]));
const fp = formPolicy.filter(r => r.group === 'stage4');
md_ += `\n## 5. All 36 forms — win rate (95% CI) per policy\n\n` + md(['form', 'skill', 'rarity', ...P], [...new Map(fp.map(r => [r.form_id, r]))].map(([id, r0]) => [id, r0.skill_name, r0.rarity, ...P.map(p => { const r = fp.find(x => x.form_id === id && x.policy === p); return r ? ci(r) : '–'; })]));
md_ += `\n## 6. Where runs end (share of ALL runs losing at each room, Stage 4) and first-death distribution\n\n` + md(['egg', 'policy', ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `lose r${n}`), 'win'], byEgg.map(r => [r.egg_name, r.policy, ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => pct(r['lose_final_r' + n])), pct(r.win_rate)]));
md_ += `\nPer room (all Stage-4, by policy): \`summary/by_room_policy_stage4.csv\`; per form: \`by_room_form_policy.csv\`.\n\n## 7. Swipes and estimated time (Stage 4; winners only for the 10–15 min target)\n\n` + md(['egg', 'policy', 'swipes/run median [min–max]', 'swipes median (wins)', 'est. min wins (lo–hi s/swipe)', '% wins inside 10–15 min*'], byEgg.map(r => [r.egg_name, r.policy, `${num(r.swipes_median, 0)} [${num(r.swipes_min, 0)}–${num(r.swipes_max, 0)}]`, num(r.swipes_win_median, 0), r.swipes_win_n ? `${num(r.min_lo_win_median)}–${num(r.min_hi_win_median)}` : '–', pct(r.min_target_hit_win_rate)]));
md_ += `\n*window overlaps the 10–15 min target for either seconds-per-swipe assumption.\n\n## 8. Board jams (Stage 4)\n\n` + md(['egg', 'policy', 'runs with ≥1 jam', 'jams/run', 'jams per swipe', 'HP lost to jams / run', 'jam share of all HP loss'], byEgg.map(r => [r.egg_name, r.policy, pct(r.jam_run_rate), num(r.jam_events_per_run, 2), pct(r.jam_swipe_frac), num(r.jam_hp_lost_mean), pct(r.jam_share_of_hp_loss)]));
md_ += `\n## 9. Auto vs ordinary runes (Stage 4; per run means)\n\n` + md(['egg', 'policy', 'casts/run [min–med–max]', 'casts/100 swipes', 'skill dmg share', 'skill armor share', 'skill heal share'], byEgg.map(r => [r.egg_name, r.policy, `${num(r.casts_mean)} [${num(r.casts_min, 0)}–${num(r.casts_median, 0)}–${num(r.casts_max, 0)}]`, num(r.casts_per_100_swipes), pct(r.skill_dmg_share), pct(r.skill_armor_share), pct(r.skill_heal_share)]));
md_ += `\n## 10. Stag boss (Stage 4)\n\n` + md(['egg', 'policy', 'reached', 'win | reached', 'stag HP left at loss (median, min–max)', 'roots applied / hits / released per stag run'], byEgg.map(r => [r.egg_name, r.policy, pct(r.stag_reached_rate), pct(r.stag_win_given_reached), r.stag_hp_left_frac_at_loss_n ? `${pct(r.stag_hp_left_frac_at_loss_median)} (${pct(r.stag_hp_left_frac_at_loss_min)}–${pct(r.stag_hp_left_frac_at_loss_max)})` : '–', `${num(r.roots_applied_per_stag_run)} / ${num(r.root_hits_per_stag_run)} / ${num(r.roots_released_per_stag_run)}`]));
const early = relicEarly.filter(r => r.egg === 'ALL');
md_ += `\n## 11. Relics\n\nFair estimate: among runs that cleared room 4, win rate with vs without the relic picked at the room-2/4 rewards (random offers, random pick). Pooled over all Stage-4 forms.\n\n` + md(['relic', 'policy', 'n with', 'win with', 'n without', 'win without', 'Δ'], early.map(r => [r.relic, r.policy, r.runs_cleared_r4_with, `${pct(r.win_with)} (${pct(r.win_with_lo)}–${pct(r.win_with_hi)})`, r.runs_cleared_r4_without, `${pct(r.win_without)} (${pct(r.win_without_lo)}–${pct(r.win_without_hi)})`, `${r.diff >= 0 ? '+' : ''}${num(100 * r.diff)} pp`]));
md_ += `\nPer egg: \`relic_effect_early.csv\`. Naive final-ownership table (biased): \`relic_ownership_naive.csv\`. Offers/picks: \`relic_offers_picks.csv\`.\n`;
if (sens.length) {
  const labels = Object.keys(sens[0]).filter(k => /^win_p[\d.]+$/.test(k));
  md_ += `\n## 12. Sensitivity to simulated quiz accuracy (Stage 4, win rate pooled by rarity)\n\n` + md(['rarity', 'policy', ...labels], ['Common', 'Rare', 'Epic', 'Legendary'].flatMap(ra => P.map(p => { const rows = sens.filter(s => s.policy === p && formPolicy.find(f => f.form_id === s.form_id && f.policy === p)?.rarity === ra && formPolicy.find(f => f.form_id === s.form_id).group === 'stage4'); return [ra, p, ...labels.map(l => pct(mean(rows.map(r => r[l]))))]; })));
}
md_ += `\n## Files\n\nSee \`README.md\` (data dictionary) in the parent folder. Summary CSVs live in \`summary/\`.\n`;
fs.writeFileSync(path.join(dir, 'REPORT.md'), md_);
fs.writeFileSync(path.join(dir, 'summary', 'validation.json'), JSON.stringify(validation, null, 2));
console.log(validation.map(v => (v.ok ? 'OK   ' : 'FAIL ') + v.name + ' ' + v.detail).join('\n'));
console.log('wrote', path.join(dir, 'REPORT.md'));
