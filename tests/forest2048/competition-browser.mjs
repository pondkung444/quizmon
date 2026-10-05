import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {newReplay,replay,replayResult} from '../../src/lib/forest2048/replay.ts';
const root=path.resolve('public'),out=path.resolve(process.env.FOREST_TEST_OUTPUT||'output/endless-competition');fs.mkdirSync(out,{recursive:true});
const account='22222222-2222-4222-8222-222222222222';
const companion={id:'11111111-1111-4111-8111-111111111111',name:'คู่หูทดสอบ',speciesName:'มังกรผลึก',stage:4,eggPrefix:'egg1',lane:'math',personality:'A',isActive:true,stats:{hp:100,atk:100,def:100,spd:100,foc:100},image:'/pets/egg1_stage4_math_A.png',config:{hp:500,attack:25,armor:25,heal:40,bonus:.15,cooldown:5}};
const questions=[['1+1?',['2','3'],0,'https://example.com/question.png'],['2+2?',['4','5'],0],['3+3?',['6','7'],0]];
let count=0,best=0,fail=false,drop=false,companionFailures=1;const runs=new Map(),apiErrors=[];
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/2048')){
  res.setHeader('Content-Type','application/json');
  if(req.url.includes('companions')){if(companionFailures){companionFailures--;res.writeHead(503);return res.end(JSON.stringify({error:'fixture connection failed'}));}return res.end(JSON.stringify({accountId:account,companions:[companion]}));}
  if(req.url.includes('/start')){
   let raw='';for await(const chunk of req)raw+=chunk;assert.equal(JSON.parse(raw).balanceVersion,4);
   const id='44444444-4444-4444-8444-'+String(++count).padStart(12,'0');
   const initial=newReplay({version:3,runeVersion:1,balanceVersion:4,endlessVersion:1,relicVersion:1,skillVersion:1,accountId:account,companion,questions,hero:'math',seed:12345,routeSeed:12345,room:1,coins:0,relics:[],phase:'battle',revived:false,history:[]});runs.set(id,{s:initial,revision:0});
   return res.end(JSON.stringify({accountId:account,companion,questions,competition:{id,seed:12345},initial}));
  }
  if(req.method==='POST'){
   let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),row=runs.get(body.id);
   if(fail){res.writeHead(503);return res.end(JSON.stringify({error:'offline fixture'}));}
   const events=body.events.slice(row.revision-body.from);if(events.length){row.s=replay(row.s,events);row.revision+=events.length;best=Math.max(best,replayResult(row.s).rooms);}
   if(drop){drop=false;req.socket.destroy();return;}
   return res.end(JSON.stringify({revision:row.revision,...replayResult(row.s)}));
  }
  const mine=best?{rank:best>12?1:2,name:'นักสำรวจทดสอบ',rooms:best,mine:true,companion}:null;
  const recent=[...runs].reverse().map(([id,r])=>({id,...replayResult(r.s),date:new Date().toISOString(),companion}));
  return res.end(JSON.stringify({board:{leaders:[{rank:1,name:'เพื่อนนักสำรวจ',rooms:12,companion},...(mine?[mine]:[])],mine,players:mine?2:1},stats:{best,runs:runs.size,bosses:recent.reduce((n,r)=>n+r.bosses,0),swipes:recent.reduce((n,r)=>n+r.swipes,0),maxRune:Math.max(0,...recent.map(r=>r.maxRune)),recent}}));
 }
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]),req.url.split('?')[0].endsWith('/')?'index.html':'');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 }catch(error){if(error.message!=='คำสั่งไม่ถูกต้อง')apiErrors.push(error.message);res.writeHead(422);res.end(JSON.stringify({error:error.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];try{for(const width of [320,390,430]){
 const context=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/2048/');if(width===320)await page.getByRole('button',{name:'ลองเชื่อมใหม่',exact:true}).click();await page.waitForFunction(()=>competitionData.board.leaders.length>0);
 await page.screenshot({path:path.join(out,'home-'+width+'.png')});await page.getByRole('button',{name:'ดูอันดับทั้งหมด',exact:true}).click();await page.getByRole('heading',{name:'นักสำรวจไปไกลสุด'}).waitFor();
 await page.getByRole('button',{name:'หน้าแรก',exact:true}).click();await page.getByRole('button',{name:'เลือกคู่หู · เริ่มสำรวจ',exact:true}).click();await page.locator('.picker-skill').waitFor();
 const skillMetrics=await page.locator('.picker-skill').evaluate(el=>({font:parseFloat(getComputedStyle(el.querySelector('.picker-skill-effect')).fontSize),title:parseFloat(getComputedStyle(el.querySelector('h3')).fontSize),overflow:el.scrollWidth>el.clientWidth+1}));assert.ok(skillMetrics.font>=16&&skillMetrics.title>=22&&!skillMetrics.overflow);
 await page.screenshot({path:path.join(out,'auto-picker-'+width+'.png')});
 if(width===390){const checked=await page.evaluate(()=>{const cards=[];for(const egg of Object.keys(AUTO_SKILLS))for(const lane of ['math','science','balanced'])for(const personality of ['A','B']){const pet={...forestAccount.companions[0],eggPrefix:egg,lane,personality,stage:4};showCompanionPicker({...forestAccount,companions:[pet]},startRun,showHome);const el=document.querySelector('.picker-skill');cards.push({name:el.querySelector('h3').textContent,overflow:el.scrollWidth>el.clientWidth+1});}showCompanions();return cards;});assert.equal(checked.length,36);assert.ok(checked.every(c=>c.name&&!c.overflow));}
 await page.locator('[data-action=start]').click();await page.waitForFunction(()=>run?.phase==='battle'&&run.competition);
 const id=await page.evaluate(()=>run.competition.id);
 const bounds=await page.locator('#board').boundingBox();assert.ok(bounds.width>210);assert.ok(bounds.y+bounds.height<= (width===320?568:844));
 assert.equal(await page.locator('#run-hud').isVisible(),false);assert.ok(await page.locator('.forest-wallet').isVisible());
 await page.screenshot({path:path.join(out,'game-'+width+'.png')});await page.locator('#skill').click();await page.locator('.auto-info .picker-skill').waitFor();await page.screenshot({path:path.join(out,'auto-info-'+width+'.png')});await page.getByRole('button',{name:'กลับไปการเดินทาง',exact:true}).click();
 // Ranked moves save one full checkpoint after metrics/journal update, even before network acknowledgement.
 await page.evaluate(()=>{window.saveWrites=0;window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===saveKey())window.saveWrites++;return window.originalSetItem.call(this,key,value);};window.walletBefore=document.querySelector('.forest-wallet');});
 // Real touch input, then a small deterministic bot uses the same browser actions.
 const dir=await page.evaluate(()=>DIRS.find(d=>slide(state.board,d,state.cfg.rune).changed));
 const cdp=await context.newCDPSession(page),cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2,dx=dir==='left'?-60:dir==='right'?60:0,dy=dir==='up'?-60:dir==='down'?60:0;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-dx/2,y:cy-dy/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+dx/2,y:cy+dy/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>state.moves===1&&!busy);
 const durable=await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;const saved=JSON.parse(localStorage.getItem(saveKey()));return{writes:window.saveWrites,moves:saved.battle.moves,swipes:saved.runMetrics.swipes,walletReused:window.walletBefore===document.querySelector('.forest-wallet')};});assert.deepEqual(durable,{writes:1,moves:1,swipes:1,walletReused:true});
 fail=true;
 await page.evaluate(()=>{runSwipe(DIRS.find(d=>slide(state.board,d,state.cfg.rune).changed));render();settleRun();});await page.waitForFunction(()=>syncError);
 await (await page.locator('#run-panel').isVisible()?page.locator('.phase-navigation button').last():page.locator('#reset')).click();await page.getByRole('button',{name:'หน้าแรก · ดูอันดับ',exact:true}).click();await page.reload();await page.getByRole('button',{name:'เล่นต่อ',exact:true}).click();assert.equal(await page.evaluate(()=>run.runMetrics.swipes),2);
 const tiles=await page.evaluate(()=>({expected:state.board.flatMap((t,i)=>t?[{cell:i,value:String(t.v),frozen:!!t.f}]:[]),actual:[...document.querySelectorAll('#board .tile')].map(el=>({cell:Number(el.dataset.cell),value:el.querySelector('.rune-number').textContent,frozen:el.classList.contains('frozen')})).sort((a,b)=>a.cell-b.cell)}));assert.deepEqual(tiles.actual,tiles.expected);
 fail=false;drop=true;await page.evaluate(()=>flushCompetition()); // Server accepted, response lost: retry must deduplicate.
 await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>outbox.every(q=>!q.events.length));
 for(let n=0;n<500&&await page.evaluate(()=>distance()<9&&!terminal());n++){
  await page.evaluate(()=>{
   if(run.phase==='battle'){
    let bestDir,bestScore=-Infinity;
    for(const dir of DIRS){const s=structuredClone(state);let seed=run.seed;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};if(!relicSwipe(s,dir,rng))continue;
     const score=(state.enemyHp-s.enemyHp)*3+(s.hp-state.hp)*2+s.armor+(16-s.board.filter(Boolean).length)*2;if(score>bestScore){bestScore=score;bestDir=dir;}}
    runSwipe(bestDir);render();settleRun();
   }else document.querySelector('#run-content .choice:not(:disabled)')?.click();
  });
 }
 assert.equal(await page.evaluate(()=>distance()),9);await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>!sending&&outbox.every(q=>!q.events.length));
 const local=await page.evaluate(()=>({seed:run.seed,phase:run.phase,board:state.board,hp:state.hp,relics:run.relics,history:run.history}));const remote=runs.get(id).s;assert.deepEqual(local,{seed:remote.run.seed,phase:remote.run.phase,board:remote.state.board,hp:remote.state.hp,relics:remote.run.relics,history:remote.run.history});
 await (await page.locator('#run-panel').isVisible()?page.locator('.phase-navigation button').last():page.locator('#reset')).click();await page.getByRole('button',{name:'จบการเดินทางครั้งนี้',exact:true}).click();await page.getByRole('button',{name:'กลับไปเล่นต่อ',exact:true}).click();assert.equal(await page.evaluate(()=>run.phase),'doors');
 await (await page.locator('#run-panel').isVisible()?page.locator('.phase-navigation button').last():page.locator('#reset')).click();await page.getByRole('button',{name:'จบการเดินทางครั้งนี้',exact:true}).click();await page.getByRole('button',{name:'ยืนยันจบรัน',exact:true}).click();await page.getByRole('heading',{name:'บันทึกการเดินทาง'}).waitFor();await page.evaluate(()=>flushCompetition());
 await page.screenshot({path:path.join(out,'summary-'+width+'.png')});await page.getByRole('button',{name:'ดูสถิติของฉัน',exact:true}).click();await page.getByRole('heading',{name:'สถิติของฉัน'}).waitFor();await page.screenshot({path:path.join(out,'stats-'+width+'.png')});
 // A quarantined invalid journal cannot block a different valid new run.
 // Use a fresh fixture start for this negative case.
 if(width===430){await page.getByRole('button',{name:'หน้าแรก',exact:true}).click();await page.getByRole('button',{name:'เลือกคู่หู · เริ่มสำรวจ',exact:true}).click();await page.locator('[data-action=start]').click();await page.waitForFunction(()=>run?.phase==='battle');
  await page.evaluate(()=>{outbox.find(q=>q.id===run.competition.id).events.push({type:'score',value:9999});saveOutbox();flushCompetition();});await page.waitForFunction(()=>outbox.some(q=>q.blocked));
  await page.evaluate(()=>track({type:'end'},()=>{run.phase='ended';persist();showSummary(false);}));await page.getByRole('button',{name:'เลือกคู่หู · เล่นอีกครั้ง',exact:true}).click();await page.locator('[data-action=start]').click();await page.waitForFunction(()=>run?.phase==='battle');
  await page.evaluate(()=>{runSwipe(DIRS.find(d=>slide(state.board,d,state.cfg.rune).changed));render();settleRun();});await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>outbox.filter(q=>!q.blocked).every(q=>!q.events.length));
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);results.push({width,rooms:9,offlineResume:true,lostAckRetry:true,clientServerMatch:true,errors});await context.close();
 }assert.deepEqual(apiErrors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.close();}
