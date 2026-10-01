// Evaluated INSIDE the vm context after runes.js, skills.js, engine.js, `let state;`, run.js.
// It only (a) stubs UI, (b) wraps engine functions to count things, (c) drives a whole run with a bot.
// It never changes game rules. Anything copied from showPhase() closures is marked "MIRROR run.js".
'use strict';
for (const n of ['panel', 'hidePanel', 'showPhase', 'runHUD', 'render', 'updateImages', 'persist']) globalThis[n] = () => {};

const zero = () => ({
  moves: 0, enemy_attacks: 0, enemy_hp_lost: 0, armor_blocked: 0, jam_events: 0, jam_hp_lost: 0, casts: 0,
  total_dmg: 0, skill_dmg: 0, skill_armor: 0, skill_heal: 0, ord_armor: 0, ord_heal: 0,
  root_hits: 0, roots_released: 0, roots_applied: 0,
});
let R = zero();       // counters of the room currently being fought
let P = { f2keep: 0 }; // per-swipe scratch for root accounting
const wrap = (name, fn) => { const orig = globalThis[name]; globalThis[name] = (...a) => fn(orig, a); };

for (const name of ['autoTick', 'autoMergeEffects', 'autoPostMerges', 'autoSpark', 'autoAfterAttack', 'autoCast']) {
  wrap(name, (orig, a) => {
    const s = a[0], e = s.enemyHp, ar = s.armor, h = s.hp;
    const r = orig(...a);
    R.skill_dmg += Math.max(0, e - s.enemyHp); R.skill_armor += Math.max(0, s.armor - ar); R.skill_heal += Math.max(0, s.hp - h);
    if (name === 'autoCast' && r === true) R.casts++;
    return r;
  });
}
wrap('recover', (orig, a) => {
  const s = a[0], jam = !canMove(s.board), h = s.hp;
  const r = orig(...a);
  if (jam) { R.jam_events++; R.jam_hp_lost += h - s.hp; }
  return r;
});
wrap('log', (orig, a) => {
  const s = a[0], msg = a[1];
  if (typeof msg === 'string') {
    let m;
    if (msg[0] === '#' && (m = msg.match(/⚔️?\d+.*?🛡️?\+(\d+) 💚\+(\d+)/))) { R.ord_armor += +m[1]; R.ord_heal += +m[2]; }
    else if (msg.startsWith('🌿 พันราก')) { // "🌿 พันราก"
      R.roots_applied += Math.max(0, s.board.filter(t => t && t.f === 2).length - P.f2keep);
    }
  }
  return orig(...a);
});
wrap('enterBattle', (orig, a) => { const r = orig(...a); R = { room: run.room, enemy: a[0], hp_start: state.hp, enemy_hp_max: state.enemyHp, ...zero() }; return r; });
wrap('runSwipe', (orig, a) => {
  const s = state, dir = a[0], prev = slide(s.board, dir, s.cfg.rune);
  const e0 = s.enemyHp, mv0 = s.moves;
  P.f2keep = s.board.filter(t => t && t.f === 2).length - prev.hits.filter(i => s.board[i].f === 2).length;
  const r = orig(...a);
  if (s.moves > mv0) {
    R.moves++; R.total_dmg += e0 - s.enemyHp;
    R.root_hits += prev.hits.length; R.roots_released += prev.hits.filter(i => prev.board[i].f === 0).length;
    if (s.lastAttack) { R.enemy_attacks++; R.enemy_hp_lost += s.lastAttack.damage; R.armor_blocked += s.lastAttack.blocked; }
  }
  return r;
});

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function choose(brng, policy) {
  const dirs = [], sc = [];
  for (const d of DIRS) {
    const p = slide(state.board, d, state.cfg.rune); if (!p.changed) continue;
    dirs.push(d);
    sc.push(policy === 'greedy' ? p.merges.length : policy === 'greedy-egg' ? p.merges.filter(t => t.t === 'x').length * 100 + p.merges.length : 0);
  }
  if (!dirs.length) return null;
  if (policy === 'random') return dirs[Math.floor(brng() * dirs.length)];
  const max = Math.max(...sc), best = dirs.filter((_, i) => sc[i] === max);
  return best[Math.floor(brng() * best.length)];
}

const SUM = ['moves', 'enemy_attacks', 'enemy_hp_lost', 'armor_blocked', 'jam_events', 'jam_hp_lost', 'casts', 'total_dmg', 'skill_dmg', 'skill_armor', 'skill_heal', 'ord_armor', 'ord_heal', 'root_hits', 'roots_released', 'roots_applied'];

globalThis.__runOne = function (inp) {
  const brng = mulberry32(inp.botSeed), pick = arr => arr[Math.floor(brng() * arr.length)];
  const questions = Array.from({ length: 12 }, (_, i) => ['Q' + i, ['a', 'b', 'c'], i % 3]);
  const companion = { id: 'sim', eggPrefix: inp.egg, stage: inp.stage, personality: inp.personality, lane: inp.lane, config: inp.config };
  // MIRROR run.js startRun(): identical run object, minus the network snapshot.
  run = { version: 3, runeVersion: 1, balanceVersion: 2, skillVersion: 1, accountId: 'sim', companion, questions, hero: companion.lane,
          seed: inp.gameSeed >>> 0, room: 1, coins: 0, relics: [], phase: 'battle', revived: false, echo: false, started: 0, history: [] };
  state = undefined; R = zero();
  enterBattle('mushroom');

  const rooms = [], events = [], path = [];
  let swipes = 0, outcome = null, firstDeath = null, reviveUsed = 0, reviveOk = 0, awaitingRevive = false, nonBattle = 0,
      quizQ = 0, quizC = 0, relicSource = 'battle_reward', deaths = {};
  const closeRoom = result => { rooms.push({ ...R, result, hp_end: state.hp, enemy_hp_left: state.enemyHp, deaths_in_room: deaths[R.room] || 0 }); };

  for (let guard = 0; guard < 200000; guard++) {
    const ph = run.phase;
    if (ph === 'battle') {
      if (awaitingRevive) { awaitingRevive = false; reviveOk++; }
      if (state.status === 'playing') {
        if (swipes >= inp.maxSwipes) { outcome = 'timeout'; break; }
        const dir = choose(brng, inp.policy);
        if (!dir) { outcome = 'stuck'; break; }
        const mv = state.moves; runSwipe(dir); if (state.moves > mv) swipes++;
      }
      if (state.status === 'won') { closeRoom('won'); settleRun(); }
      else if (state.status === 'lost') {
        deaths[run.room] = (deaths[run.room] || 0) + 1;
        if (!firstDeath) firstDeath = { room: run.room, enemy: state.enemy, left: state.enemyHp, max: R.enemy_hp_max };
        settleRun();
      }
    } else if (ph === 'doors') {
      const type = pick(run.doors); path.push(type); enterDoor(type);
      if (!ENEMY[type]) nonBattle++;
    } else if (ph === 'relic') {
      const offered = run.offers.slice();
      if (offered.length) { const id = pick(offered); events.push({ room: run.room, source: relicSource, offered, picked: [id] }); chooseRelic(id); }
      else { run.coins += 25; makeDoors(); } // MIRROR run.js relic panel: empty pool -> 25 coins
      relicSource = 'battle_reward';
    } else if (ph === 'rest') {
      state.hp = Math.min(state.cfg.hp, state.hp + Math.ceil(state.cfg.hp * .3)); completeUtility(); // MIRROR run.js rest
    } else if (ph === 'shop') {
      const offered = run.offers.slice(), bought = [];
      for (;;) { const c = run.offers.filter(id => !has(id)); if (!c.length || run.coins < 40) break; const id = pick(c); run.coins -= 40; run.relics.push(id); bought.push(id); } // MIRROR run.js shop buy
      events.push({ room: run.room, source: 'shop', offered, picked: bought });
      completeUtility();
    } else if (ph === 'quiz' || ph === 'reviveQuiz') {
      const q = questionBank()[run.quiz.ids[run.quiz.index]], ok = brng() < inp.quizP;
      const wrong = [0, 1, 2].filter(i => i !== q[2]);
      quizQ++; if (ok) quizC++;
      answer(ok ? q[2] : pick(wrong));
      if (ph === 'reviveQuiz' && run.phase === 'battle') awaitingRevive = true;
    } else if (ph === 'quizReward') {
      if (run.quizPassed && RELICS.some(r => !has(r.id))) { // MIRROR run.js quizReward "relic 1 of 3"
        run.history.push({ room: run.room, type: 'quiz', hp: state.hp }); run.phase = 'relic'; run.offers = offers(); relicSource = 'quiz';
      } else if (run.quizPassed) { run.coins += 25; completeUtility(); } // MIRROR: 25 coins
      else completeUtility();
    } else if (ph === 'revivePrompt') {
      run.revived = true; reviveUsed++; beginQuiz(true); // MIRROR run.js revivePrompt "try revive quiz"
    } else if (ph === 'complete') { outcome = 'win'; break; }
    else if (ph === 'failed') { closeRoom('lost'); outcome = 'loss'; break; }
    else { outcome = 'bad_phase:' + ph; break; }
  }
  if (!outcome) outcome = 'guard';
  if (outcome === 'timeout' || outcome === 'stuck') closeRoom(outcome);

  const row = {
    outcome, final_room: run.room, first_death_room: firstDeath?.room ?? '', first_death_enemy: firstDeath?.enemy ?? '',
    first_death_enemy_hp_left: firstDeath?.left ?? '', first_death_enemy_hp_frac: firstDeath ? +(firstDeath.left / firstDeath.max).toFixed(4) : '',
    revive_used: reviveUsed, revive_success: reviveOk, coins_end: run.coins, relics: run.relics.join('|'), n_relics: run.relics.length,
    door_path: path.join('>'), swipes, battle_rooms: rooms.filter(r => r.result === 'won' || r.result === 'lost').length,
    nonbattle_rooms: nonBattle, quiz_questions: quizQ, quiz_correct: quizC,
    cfg_hp: inp.config.hp, cfg_cooldown: inp.config.cooldown,
  };
  for (const k of SUM) row[k] = rooms.reduce((n, r) => n + r[k], 0);
  row.ord_dmg = row.total_dmg - row.skill_dmg;
  for (let n = 1; n <= 8; n++) {
    const r = rooms.filter(x => x.room === n);
    row['swipes_r' + n] = r.length ? r.reduce((a, x) => a + x.moves, 0) : '';
    row['deaths_r' + n] = deaths[n] || 0;
  }
  const stag = rooms.find(r => r.room === 8);
  row.stag_reached = stag ? 1 : 0;
  row.stag_result = stag ? stag.result : '';
  row.stag_enemy_hp_left = stag && stag.result !== 'won' ? stag.enemy_hp_left : '';
  return { row, rooms: rooms.map(r => ({ ...r, ord_dmg: r.total_dmg - r.skill_dmg })), events };
};
