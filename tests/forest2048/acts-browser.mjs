import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {newReplay,replay,replayResult} from '../../src/lib/forest2048/replay.ts';
const root=path.resolve('public'),out=path.resolve(process.env.FOREST_TEST_OUTPUT||'output/acts-phase5');fs.mkdirSync(out,{recursive:true});
const account='22222222-2222-4222-8222-222222222222';
const companion={id:'11111111-1111-4111-8111-111111111111',name:'คู่หูทดสอบ',speciesName:'มังกรผลึก',stage:4,eggPrefix:'egg1',lane:'math',personality:'A',isActive:true,stats:{hp:100,atk:100,def:100,spd:100,foc:100},image:'/pets/egg1_stage4_math_A.png',config:{hp:100000,attack:10000,armor:5000,heal:40,bonus:.15,cooldown:5}};
const questions=[['1+1',['2','3'],0],['2+2',['4','5'],0],['3+3',['6','7'],0]],runs=new Map(),errors=[];let count=0,offline=false,drop=false;
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/2048')){res.setHeader('Content-Type','application/json');
  if(req.url.includes('companions'))return res.end(JSON.stringify({accountId:account,companions:[companion]}));
  if(req.url.includes('/start')){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);assert.equal(body.journeyVersion,1);assert.equal(body.mechanicsVersion,1);assert.equal(body.contentVersion,1);const id='44444444-4444-4444-8444-'+String(++count).padStart(12,'0');const initial=newReplay({version:3,journeyVersion:1,mechanicsVersion:1,contentVersion:1,balanceVersion:4,relicVersion:1,runeVersion:1,skillVersion:1,accountId:account,companion,questions,hero:'math',seed:12345,routeSeed:12345,coins:0,relics:[],revived:false,history:[]});runs.set(id,{snapshot:initial,revision:0});return res.end(JSON.stringify({accountId:account,companion,questions,competition:{id,seed:12345},initial}));}
  if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),row=runs.get(body.id);if(offline){res.writeHead(503);return res.end(JSON.stringify({error:'offline fixture'}));}const events=body.events.slice(row.revision-body.from);if(events.length){row.snapshot=replay(row.snapshot,events);row.revision+=events.length;}if(drop){drop=false;req.socket.destroy();return;}return res.end(JSON.stringify({revision:row.revision,...replayResult(row.snapshot)}));}
  const all=[...runs.values()].map(r=>r.snapshot),best=Math.max(0,...all.map(s=>s.run.history.length));
  const mine=best?{rank:1,rooms:best,name:'ผู้ทดสอบ',companion:{image:companion.image},mine:true}:null;
  return res.end(JSON.stringify({board:{leaders:mine?[mine]:[],mine,players:mine?1:0},stats:{runs:runs.size,best,bosses:all.reduce((n,s)=>n+replayResult(s).bosses,0),maxRune:0,recent:[]}}));
 }
 const url=req.url.split('?')[0],file=path.resolve(root,'.'+decodeURIComponent(url),url.endsWith('/')?'index.html':'');if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 }catch(error){errors.push(error.message);res.writeHead(422);res.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,activePage;const results=[];
function gameplay(s){const r=s.run,b=s.state;return{room:r.room,phase:r.phase,seed:r.seed,coins:r.coins,relics:r.relics,offers:r.offers,doors:r.doors,history:r.history,services:r.serviceCounts,journal:r.journeyLog,sessions:r.sessionCounts,hp:b.hp,enemyHp:b.enemyHp,board:b.board,charge:b.charge,armor:b.armor,moves:b.moves,status:b.status,countdown:b.countdown,hazards:b.hazards,poison:b.poison};}
try{browser=await chromium.launch({channel:'msedge',headless:true});for(const width of [320,390,430]){
 const context=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true}),page=await context.newPage(),pageErrors=[];activePage=page;page.on('pageerror',e=>pageErrors.push(e.message));
 const legacy=newReplay({version:3,endlessVersion:1,balanceVersion:4,relicVersion:1,runeVersion:1,skillVersion:1,accountId:account,companion,questions,hero:'math',seed:12345,routeSeed:12345,coins:0,relics:[],revived:false,history:[]});
 await context.addInitScript(({account,saved})=>{if(!localStorage.getItem('student-test-seeded')){localStorage.setItem('quizmon-forest-run-v1:'+account,JSON.stringify(saved));localStorage.setItem('student-test-seeded','1');}},{account,saved:{...legacy.run,battle:legacy.state}});
 await page.goto('http://127.0.0.1:'+server.address().port+'/2048/');await page.getByRole('heading',{name:'การเดินทาง 3 ด่าน'}).waitFor();assert.equal(await page.getByRole('button',{name:'เล่นต่อ',exact:true}).count(),0);await page.screenshot({path:path.join(out,'home-'+width+'.png')});
 assert.doesNotMatch(await page.locator('#run-content').innerText(),/Endless|ENDLESS|ยังใช้การต่อสู้พื้นฐาน/);
 await page.getByRole('button',{name:'ดูอันดับทั้งหมด',exact:true}).click();await page.getByRole('heading',{name:'นักสำรวจไปไกลสุด'}).waitFor();await page.getByRole('button',{name:'หน้าแรก',exact:true}).click();
 await page.getByRole('button',{name:'เลือกคู่หู · เริ่ม 3 ด่าน',exact:true}).click();await page.locator('[data-action=start]').click();await page.waitForFunction(()=>run?.journeyVersion===1&&run.phase==='doors');assert.equal(await page.locator('#run-content .choice').count(),2);await page.screenshot({path:path.join(out,'doors-'+width+'.png')});
 const doors=await page.evaluate(()=>run.doors);await page.reload();await page.getByRole('button',{name:'เล่นต่อ',exact:true}).click();assert.deepEqual(await page.evaluate(()=>run.doors),doors);await page.locator('#run-content .choice').first().click();await page.waitForFunction(()=>run.phase==='battle');
 assert.ok(await page.locator('#board').isVisible());await page.screenshot({path:path.join(out,'battle-'+width+'.png')});
 // One actual pointer swipe verifies the interaction path, not only engine calls.
 const bounds=await page.locator('#board').boundingBox(),dir=await page.evaluate(()=>DIRS.find(d=>slide(state.board,d,state.cfg.rune).changed));const dx=dir==='left'?-60:dir==='right'?60:0,dy=dir==='up'?-60:dir==='down'?60:0,cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
 const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-dx/2,y:cy-dy/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+dx/2,y:cy+dy/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>state.moves>=1&&!busy);
 offline=true;await page.evaluate(()=>{trackActSession('leave');flushCompetition();});await page.waitForFunction(()=>syncError);const before=await page.evaluate(()=>({room:run.room,phase:run.phase,board:state.board,hp:state.hp,charge:state.charge}));
 await page.reload();await page.getByRole('button',{name:'เล่นต่อ',exact:true}).click();assert.deepEqual(await page.evaluate(()=>({room:run.room,phase:run.phase,board:state.board,hp:state.hp,charge:state.charge})),before);
 offline=false;drop=true;await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>!sending);await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>outbox.every(q=>!q.events.length));
 const screenshots=new Set();
 for(let step=0;step<1200&&!await page.evaluate(()=>terminal());step++){
  const checkpoint=await page.evaluate(()=>({room:run.room,phase:run.phase}));if([10,20].includes(checkpoint.room)&&checkpoint.phase==='relic'&&!screenshots.has(checkpoint.room)){screenshots.add(checkpoint.room);await page.screenshot({path:path.join(out,'act-reward-'+checkpoint.room+'-'+width+'.png')});await page.reload();await page.getByRole('button',{name:'เล่นต่อ',exact:true}).click();
   assert.equal(await page.evaluate(()=>run.offers.filter(id=>RELIC_V1.find(r=>r.id===id).region).length),1);
   assert.equal(await page.locator('#run-content .choice').first().locator('img').count(),1);
   await page.locator('#run-content .choice').first().click();
   const battleDoor=await page.evaluate(()=>run.doors.findIndex(id=>ACT_ENEMIES[id]));
   await page.locator('#run-content .choice').nth(battleDoor).click();
   const index=await page.evaluate(()=>run.relics.length-1);
   await page.locator('#relics .owned-relic').nth(index).click();
   assert.equal(await page.locator('.relic-detail-art').count(),1);
   await page.screenshot({path:path.join(out,'regional-relic-detail-'+checkpoint.room+'-'+width+'.png')});
   await page.getByRole('button',{name:'กลับไปการเดินทาง',exact:true}).click();
  }
  await page.evaluate(()=>{
   if(run.phase==='battle'){runSwipe(DIRS.find(d=>relicSlide(state.board,d,state.cfg.rune,has('chain')).changed));render();settleRun();}
   else if(run.phase==='doors')enterDoor(run.doors.find(id=>['rest','quiz','shop'].includes(id))||run.doors[0]);
   else if(run.phase==='relic'){if(run.offers.length)chooseRelic(run.offers[0]);else document.querySelector('#run-content .choice').click();}
   else if(['quiz','reviveQuiz'].includes(run.phase))answer(questionBank()[run.quiz.ids[run.quiz.index]][2]);
   else if(run.phase==='quizReward'&&run.quizPassed)document.querySelector('#run-content .choice').click();
   else if(['rest','shop','quizReward'].includes(run.phase))document.querySelector('#run-content .choice:last-of-type').click();
  });
 }
 assert.equal(await page.evaluate(()=>run.phase),'complete');await page.getByRole('heading',{name:'ผู้พิทักษ์ยอมรับคู่หู'}).waitFor();await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>outbox.every(q=>!q.events.length));
 const client=await page.evaluate(()=>({run,state})),row=runs.get(client.run.competition.id);assert.deepEqual(gameplay(client),gameplay(row.snapshot));assert.equal(replayResult(row.snapshot).bosses,3);assert.equal(replayResult(row.snapshot).status,'ended');
 await page.screenshot({path:path.join(out,'complete-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#run-content').scrollWidth<=document.querySelector('#run-content').clientWidth+1));
 await page.getByRole('button',{name:'ดูอันดับทั้งหมด',exact:true}).click();await page.getByText('อันดับคุณ #1 · สถิติ 30 ห้อง',{exact:true}).waitFor();await page.screenshot({path:path.join(out,'leaderboard-'+width+'.png')});
 await page.getByRole('button',{name:'หน้าแรก',exact:true}).click();assert.doesNotMatch(await page.locator('#run-content').innerText(),/Endless|ENDLESS/);await page.getByRole('button',{name:'สถิติของฉัน',exact:true}).click();await page.getByRole('heading',{name:'สถิติของฉัน'}).waitFor();assert.deepEqual(pageErrors,[]);results.push({width,rooms:30,battles:replayResult(row.snapshot).rooms,bosses:3,revision:row.revision,pageErrors,clientServerEqual:true,leaderboardRooms:30});await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}catch(error){const diagnostic={errors,client:activePage?await activePage.evaluate(()=>({phase:run?.phase,room:run?.room,syncError,outbox:outbox.map(q=>({from:q.from,blocked:q.blocked,events:q.events})),journal:run?.journeyLog})).catch(()=>null):null,server:[...runs.values()].map(r=>({revision:r.revision,phase:r.snapshot.run.phase,room:r.snapshot.run.room}))};fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(diagnostic,null,2));console.log(JSON.stringify({errors,clientPhase:diagnostic.client?.phase,clientRoom:diagnostic.client?.room,syncError:diagnostic.client?.syncError,server:diagnostic.server}));throw error;
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
