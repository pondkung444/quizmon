import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FARM_CATALOGUE,FARM_AREA_CAP,SCHOOL_CAPACITY,remainingWait} from '../../src/lib/farm/catalogue.ts';
import {legacyProjects} from '../../src/lib/farm/projects.ts';
import type {SchoolProject} from '../../src/lib/farm/school.ts';
test('approved catalogue totals, checkpoint counts and capacities',()=>{
 assert.equal(FARM_CATALOGUE.reduce((n,p)=>n+p.price,0),680);
 assert.equal(FARM_CATALOGUE.reduce((n,p)=>n+p.firstReward,20),280);
 assert.equal(FARM_CATALOGUE.reduce((n,p)=>n+p.waits.length-1,0),21);
 assert.equal(FARM_CATALOGUE.filter(p=>p.place!=='school').reduce((n,p)=>n+p.limit,4),17);
 assert.equal(FARM_AREA_CAP,24);assert.deepEqual(SCHOOL_CAPACITY.map(c=>c.jobs),[0,1,2,2,3]);
});
test('team changes rescale remaining time without resetting progress',()=>{
 assert.equal(remainingWait(900,1,2),800);assert.equal(remainingWait(700,3,0),1000);
 assert.equal(remainingWait(0,0,3),0);assert.throws(()=>remainingWait(10,4,0));
});
test('legacy projection preserves every state, deadline and layout without mutation',()=>{
 for(const status of ['draft','building','puzzle','finishing','paused','ready','placed'] as const){
  const s:SchoolProject={status,leader_id:'pet',resume_status:'puzzle',ready_at:'2026-10-11T16:00:00Z',remaining_seconds:123,round_deadline:'2026-10-11T15:00:00Z',failures:4,penalty_applied:true,tile_x:status==='placed'?1:null,tile_y:status==='placed'?1:null};
  const g={...s,id:'garden',builder_id:'old-builder',price:40,finish_seconds:300,round_seconds:180,penalty_seconds:60,layout:[{id:'bend-a',x:1,y:1,rotation:0}],completed_at:null};
  const before=JSON.stringify([s,g]);const rows=legacyProjects(s,[g],'owner');
  for(const key of Object.keys(s)) assert.deepEqual(rows[0][key as keyof SchoolProject],s[key as keyof SchoolProject]);
  assert.deepEqual(rows[1].layout,g.layout);assert.equal(rows[1].builder_id,'old-builder');
  assert.equal(JSON.stringify([s,g]),before);
 }
});
