import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPvpResync } from '../../src/lib/pvp/resync.ts';

test('PvP resync handles wake/reconnect, skips hidden/offline tabs and cleans up', () => {
  const window = new EventTarget(); const document = new EventTarget();
  let visible = true; let online = true; let now = 0; let calls = 0; let stopped = false;
  let poll = () => {};
  const cleanup = attachPvpResync(() => { calls++; }, {
    window, document, visible:()=>visible, online:()=>online, now:()=>now,
    interval:(fn,ms)=>{ assert.equal(ms,30_000); poll=fn; return ()=>{stopped=true;}; },
  });
  assert.equal(calls,0); // Mount never starts a turn or replays an answer.
  window.dispatchEvent(new Event('focus')); assert.equal(calls,1);
  document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls,1);
  now=2000; visible=false; poll(); assert.equal(calls,1);
  now=4000; visible=true; online=false; window.dispatchEvent(new Event('focus')); assert.equal(calls,1);
  online=true; window.dispatchEvent(new Event('online')); assert.equal(calls,2);
  now=6000; document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls,3);
  now=36000; poll(); assert.equal(calls,4);
  cleanup(); assert.equal(stopped,true);
  now=40000; window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online'));
  document.dispatchEvent(new Event('visibilitychange')); poll(); assert.equal(calls,4);
});
