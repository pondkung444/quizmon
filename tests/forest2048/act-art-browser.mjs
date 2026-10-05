import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {newReplay,replay,replayResult} from '../../src/lib/forest2048/replay.ts';
const root=path.resolve('public'),out=path.resolve(process.env.FOREST_TEST_OUTPUT||'output/art-phase5');fs.mkdirSync(out,{recursive:true});
const account='22222222-2222-4222-8222-222222222222';
const companion={id:'11111111-1111-4111-8111-111111111111',name:'คู่หูทดสอบ',speciesName:'มังกรผลึก',stage:4,eggPrefix:'egg1',lane:'math',personality:'A',isActive:true,stats:{hp:100,atk:100,def:100,spd:100,foc:100},image:'/pets/egg1_stage4_math_A.png',config:{hp:100000,attack:10000,armor:5000,heal:40,bonus:.15,cooldown:5}};
const questions=[['1+1',['2','3'],0],['2+2',['4','5'],0],['3+3',['6','7'],0]],runs=new Map(),errors=[];let count=0,offline=false,drop=false;
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/2048')){res.setHeader('Content-Type','application/json');
  if(req.url.includes('companions'))return res.end(JSON.stringify({accountId:account,companions:[companion]}));
  if(req.url.includes('/start')){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);assert.equal(body.journeyVersion,1);assert.equal(body.mechanicsVersion,1);assert.equal(body.contentVersion,1);const id='44444444-4444-4444-8444-'+String(++count).padStart(12,'0');const initial=newReplay({version:3,journeyVersion:1,mechanicsVersion:1,contentVersion:1,balanceVersion:4,relicVersion:1,runeVersion:1,skillVersion:1,accountId:account,companion,questions,hero:'math',seed:12345,routeSeed:12345,coins:0,relics:[],revived:false,history:[]});runs.set(id,{snapshot:initial,revision:0});return res.end(JSON.stringify({accountId:account,companion,questions,competition:{id,seed:12345},initial}));}
  if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),row=runs.get(body.id);if(offline){res.writeHead(503);return res.end(JSON.stringify({error:'offline fixture'}));}const events=body.events.slice(row.revision-body.from);if(events.length){row.snapshot=replay(row.snapshot,events);row.revision+=events.length;}if(drop){drop=false;req.socket.destroy();return;}return res.end(JSON.stringify({revision:row.revision,...replayResult(row.snapshot)}));}
  return res.end(JSON.stringify({board:{leaders:[],mine:null,players:0},stats:{runs:runs.size,best:0,bosses:0,maxRune:0,recent:[]}}));
 }
 const url=req.url.split('?')[0],file=path.resolve(root,'.'+decodeURIComponent(url),url.endsWith('/')?'index.html':'');if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 }catch(error){errors.push(error.message);res.writeHead(422);res.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,activePage;const results=[];
function gameplay(s){const r=s.run,b=s.state;return{room:r.room,phase:r.phase,seed:r.seed,coins:r.coins,relics:r.relics,offers:r.offers,doors:r.doors,history:r.history,services:r.serviceCounts,journal:r.journeyLog,sessions:r.sessionCounts,hp:b.hp,enemyHp:b.enemyHp,board:b.board,charge:b.charge,armor:b.armor,moves:b.moves,status:b.status,countdown:b.countdown,hazards:b.hazards,poison:b.poison};}

try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const [width,reducedMotion]of [[320,'no-preference'],[390,'no-preference'],[430,'no-preference'],[320,'reduce']]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion}),page=await context.newPage(),pageErrors=[],badRequests=[];activePage=page;
  page.on('pageerror',e=>pageErrors.push(e.message));page.on('response',r=>{if(r.status()>=400)badRequests.push({url:r.url(),status:r.status()});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/2048/?journey=three-acts');
  await page.getByRole('button',{name:'เลือกคู่หู · ทดลอง 3 ด่าน',exact:true}).click();await page.locator('[data-action=start]').click();await page.waitForFunction(()=>run?.phase==='doors');
  await page.locator('#run-content .choice').first().click();
  // Art fixtures isolate display checks; full gameplay/server parity lives in acts-browser.
  await page.evaluate(()=>{run.competition=null;outbox=[];});
  const enemyIds=await page.evaluate(()=>Object.keys(ACT_ART));
  for(const id of enemyIds){
   await page.evaluate(id=>{run.room=ACT_ENEMIES[id].act*10-9;enterBattle(id);run.phase='battle';render();showPhase();},id);
   await page.locator('.battle .enemy').evaluate(img=>img.decode());
   assert.equal(await page.locator('.battle .enemy').getAttribute('alt'),await page.evaluate(id=>actArtName(id),id));
   assert.equal(await page.locator('.final-guardian').count(),id==='sky_guardian'?1:0);
   assert.equal(await page.evaluate(()=>document.body.dataset.act),await page.evaluate(id=>ACTS[ACT_ENEMIES[id].act-1].id,id));
   if(['slow_striker','cave_guard','cave_heavy','cave_guardian','sky_guardian'].includes(id))await page.screenshot({path:path.join(out,id+'-'+width+'-'+reducedMotion+'.png')});
  }
  const relicIds=await page.evaluate(()=>REGIONAL_RELICS.map(r=>r.id));
  for(const id of relicIds){
   await page.evaluate(id=>showRelicArtDetail(id),id);await page.locator('.relic-detail-art').evaluate(img=>img.decode());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.getByRole('button',{name:'กลับไปการเดินทาง',exact:true}).click();
  }
  await page.evaluate(()=>{run.room=29;enterBattle('sky_guardian');run.phase='battle';state.board=Array(16).fill(null);let i=0;for(const egg of ['egg1','egg2','egg3','egg4','egg5','egg6']){state.cfg.rune=egg;state.board[i++]={v:128,t:'x',f:0};}state.cfg.rune='egg3';state.board[0]={v:1024,t:'a',f:0};state.board[1]={v:2048,t:'d',f:0};state.board[2]={v:128,t:'h',f:0};state.board[3]={v:256,t:'x',awake:true,f:0};state.board[4]={v:32,t:'x',f:1};regionalStamp(state);state.board[4].crack={remaining:2,bornMove:state.moves};state.poison={stacks:2,remaining:3,bornMove:state.moves};regionalState(state).bossPhase=2;render();showPhase();});
  assert.equal(await page.locator('.regional-crack-count').count(),1);assert.equal(await page.locator('.tile.frozen').count(),1);assert.equal(await page.locator('.guardian-phase-two').count(),1);
  assert.equal(await page.locator('.tile[data-cell="4"] .rune-number').textContent(),'32');
  for(const egg of ['egg1','egg2','egg3','egg4','egg5','egg6']){await page.evaluate(egg=>{state.cfg.rune=egg;render();},egg);await page.screenshot({path:path.join(out,'runes-'+egg+'-'+width+'-'+reducedMotion+'.png')});}
  await page.evaluate(()=>{run.room=19;enterBattle('cave_guardian');run.phase='battle';state.board=Array(16).fill(null);state.board[0]={v:128,t:'a',f:0};regionalStamp(state);state.hazards.crystals=[{cell:4,layers:2},{cell:5,layers:1}];state.hazards.warning={cell:6,dueMove:state.moves+2};render();showPhase();});
  assert.equal(await page.locator('.regional-crystal[data-layers="1"]').count(),1);assert.match(await page.locator('.regional-warning').getAttribute('aria-label'),/2 ปัด/);
  await page.screenshot({path:path.join(out,'crystal-states-'+width+'-'+reducedMotion+'.png')});
  await page.evaluate(()=>{actArtFx(4,'crystal-break');actArtFx(5,'crack-rescue');});assert.equal(await page.locator('.act-art-fx').count(),2);
  if(reducedMotion==='reduce')assert.equal(await page.locator('.act-art-fx').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.waitForFunction(()=>!document.querySelector('.act-art-fx'));
  await page.evaluate(async()=>{run.room=29;enterBattle('sky_heavy');run.phase='battle';state.cfg.skillVersion=0;state.cfg.attack=1;state.cfg.enemyHp=1000000;state.enemyHp=1000000;state.board=Array(16).fill(null);state.board[0]={v:2,t:'a',f:0};state.board[1]={v:2,t:'a',f:0};regionalStamp(state);state.board[1].crack={remaining:2,bornMove:0};const before=structuredClone(state),result=regionalSlide(state.board,'left',state.cfg.rune,false,true,state,state);state.board=result.board;state.moves++;relicMerges(state,result,'left','swipe',rng);render();showPhase();await present(before,result.merged);});
  if(reducedMotion!=='reduce')assert.equal(await page.locator('.act-art-fx.crack-rescue').count(),1);
  await page.waitForFunction(()=>!document.querySelector('.act-art-fx'));
  const assets=JSON.parse(fs.readFileSync('output/acts-phase5/assets.json','utf8'));
  await page.evaluate(async assets=>{for(const a of assets){const img=new Image();img.src='/'+a.path.replace(/^public\//,'');await img.decode();}},assets);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#board').getBoundingClientRect().width<=innerWidth));
  assert.deepEqual(pageErrors,[]);assert.deepEqual(badRequests,[]);
  results.push({width,reducedMotion,enemyImages:enemyIds.length,relicDetails:relicIds.length,decodedAssets:assets.length,pageErrors,badRequests});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-art.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
