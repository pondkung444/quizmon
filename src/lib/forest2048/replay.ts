import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export type ForestEvent = { type: string; value?: string | number };
// The legacy engine's JSON checkpoint is shared with the static browser game.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReplaySnapshot = { run: Record<string, any>; state: Record<string, any>; metrics: { swipes: number; maxRune: number } };
const files=['runes.js','skills.js','engine.js','run.js','endless.js','relics.js','relic-engine.js','relic-run.js'];
let source: string;
function engineSource(){return source??=files.map(f=>fs.readFileSync(path.join(process.cwd(),'public/2048',f),'utf8')).join('\n')+`
let state,lastPanel,metrics;
panel=(title,text,choices)=>{lastPanel={title,text,choices};};
hidePanel=updateImages=render=runHUD=persist=()=>{};
function markMetrics(){metrics.maxRune=Math.max(metrics.maxRune,...state.board.filter(Boolean).map(t=>t.v));}
function init(input){metrics={swipes:0,maxRune:0};run=input;state=undefined;enterBattle('mushroom');markMetrics();return snapshot();}
function snapshot(){return {run:structuredClone(run),state:structuredClone(state),metrics:{...metrics}};}
function restore(input){run=input.run;state=input.state;metrics=input.metrics;showPhase();}
function apply(events){for(const e of events){
 if(['failed','ended'].includes(run.phase))throw Error('การเดินทางจบแล้ว');
 const phase=run.phase;
 if(e.type==='swipe'){
  if(phase!=='battle'||state.status!=='playing'||!DIRS.includes(e.value))throw Error('ปัดไม่ได้ในสถานะนี้');
  const moves=state.moves;runSwipe(e.value);if(state.moves===moves)throw Error('ปัดไม่มีผล');metrics.swipes++;markMetrics();settleRun();
 }else if(e.type==='door'){
  if(phase!=='doors'||!run.doors.includes(e.value))throw Error('ไม่มีประตูนี้');enterDoor(e.value);showPhase();
 }else if(e.type==='relic'){
  if(phase!=='relic')throw Error('ไม่ได้รับรางวัล');
  const n=run.relics.length;chooseRelic(e.value);if(run.relics.length===n)throw Error('รับเรลิคไม่ได้');
 }else if(e.type==='buy'){
  if(phase!=='shop'||!run.offers.includes(e.value))throw Error('ไม่ได้อยู่ร้าน');
  const c=relicChoice(e.value,true);if(c.disabled)throw Error('ซื้อไม่ได้');const n=run.relics.length;c.action();if(n===run.relics.length)throw Error('ซื้อไม่สำเร็จ');
 }else if(e.type==='utility'){
  if(!['rest','shop','quizReward'].includes(phase))throw Error('ไม่มีผลห้องนี้');
  lastPanel.choices[phase==='rest'?0:lastPanel.choices.length-1].action();
 }else if(e.type==='quizRelic'){
  if(phase!=='quizReward'||!run.quizPassed)throw Error('ไม่ได้รางวัลควิซ');lastPanel.choices[0].action();
 }else if(e.type==='answer'){
  if(!['quiz','reviveQuiz'].includes(phase)||!Number.isInteger(e.value)||e.value<0||e.value>=questionBank()[run.quiz.ids[run.quiz.index]][1].length)throw Error('คำตอบไม่ถูกต้อง');answer(e.value);
 }else if(e.type==='revive'){
  if(phase!=='revivePrompt')throw Error('ช่วยชีวิตไม่ได้');lastPanel.choices[0].action();
 }else if(e.type==='cash'){
  if(phase!=='relic'||run.offers.length)throw Error('กองยังไม่หมด');lastPanel.choices[0].action();
 }else if(e.type==='end'){run.phase='ended';}
 else throw Error('คำสั่งไม่ถูกต้อง');
 markMetrics();
 }return snapshot();}
`;}
function context(){return vm.createContext({console,structuredClone,document:{createElement:()=>({}),querySelector:()=>({textContent:'',replaceChildren(){},after(){}})}});}
export function newReplay(input: Record<string,unknown>): ReplaySnapshot {
 const c=context();vm.runInContext(engineSource(),c,{timeout:1000});c.input=structuredClone(input);
 return structuredClone(vm.runInContext('init(input)',c,{timeout:1000}));
}
export function replay(snapshot: ReplaySnapshot,events:ForestEvent[]): ReplaySnapshot{
 if(events.length>256)throw new Error('ส่งได้ครั้งละไม่เกิน 256 คำสั่ง');
 const c=context();vm.runInContext(engineSource(),c,{timeout:1000});c.input=structuredClone(snapshot);c.events=structuredClone(events);
 return structuredClone(vm.runInContext('restore(input);apply(events)',c,{timeout:3000}));
}
export function replayResult(s:ReplaySnapshot){return {rooms:s.run.history.reduce((n:number,r:{room:number})=>Math.max(n,r.room),0),swipes:s.metrics.swipes,maxRune:s.metrics.maxRune,bosses:s.run.history.filter((r:{type:string})=>r.type==='stag').length,status:['failed','ended'].includes(s.run.phase)?s.run.phase:'active'};}
