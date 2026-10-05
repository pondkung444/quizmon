import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {newReplay,replay,replayResult} from '../../src/lib/forest2048/replay.ts';
const root=path.resolve('public'),out=path.resolve(process.env.FOREST_TEST_OUTPUT||'output/regional-phase3');fs.mkdirSync(out,{recursive:true});
const account='22222222-2222-4222-8222-222222222222';
const companion={id:'11111111-1111-4111-8111-111111111111',name:'คู่หูทดสอบ',speciesName:'มังกรผลึก',stage:2,eggPrefix:'egg1',lane:'math',personality:'A',isActive:true,stats:{hp:100,atk:100,def:100,spd:100,foc:100},image:'/pets/egg1_stage4_math_A.png',config:{hp:1000000,attack:12,armor:1000,heal:40,bonus:.15,cooldown:5}};
const questions=[['1+1',['2','3'],0],['2+2',['4','5'],0],['3+3',['6','7'],0]],runs=new Map(),errors=[];const scenarios=['cave_guardian','sky_guardian','stag'];let count=0,offline=false,drop=false;
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/2048')){res.setHeader('Content-Type','application/json');
  if(req.url.includes('companions'))return res.end(JSON.stringify({accountId:account,companions:[companion]}));
  if(req.url.includes('/start')){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);assert.equal(body.journeyVersion,1);assert.equal(body.mechanicsVersion,1);const id='44444444-4444-4444-8444-'+String(++count).padStart(12,'0');const initial=newReplay({version:3,journeyVersion:1,mechanicsVersion:1,balanceVersion:4,relicVersion:1,runeVersion:1,skillVersion:1,accountId:account,companion,questions,hero:'math',seed:12345,routeSeed:12345,coins:0,relics:[],revived:false,history:[]});const enemy=scenarios[count-1];initial.run.room=enemy==='stag'?9:enemy==='cave_guardian'?19:29;initial.run.doors=[enemy];const battle=replay(initial,[{type:'door',value:enemy}]);battle.state.cfg.enemyHp=10000000;battle.state.enemyHp=5000001;runs.set(id,{snapshot:battle,revision:0});return res.end(JSON.stringify({accountId:account,companion,questions,competition:{id,seed:12345},initial:battle}));}
  if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),row=runs.get(body.id);if(offline){res.writeHead(503);return res.end(JSON.stringify({error:'offline fixture'}));}const events=body.events.slice(row.revision-body.from);if(events.length){row.snapshot=replay(row.snapshot,events);row.revision+=events.length;}if(drop){drop=false;req.socket.destroy();return;}return res.end(JSON.stringify({revision:row.revision,...replayResult(row.snapshot)}));}
  return res.end(JSON.stringify({board:{leaders:[],mine:null,players:0},stats:{runs:runs.size,best:0,bosses:0,maxRune:0,recent:[]}}));
 }
 const url=req.url.split('?')[0],file=path.resolve(root,'.'+decodeURIComponent(url),url.endsWith('/')?'index.html':'');if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 }catch(error){errors.push(error.message);res.writeHead(422);res.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,activePage;const results=[];
function gameplay(s){const r=s.run,b=s.state;return{room:r.room,phase:r.phase,seed:r.seed,coins:r.coins,relics:r.relics,offers:r.offers,doors:r.doors,history:r.history,services:r.serviceCounts,journal:r.journeyLog,sessions:r.sessionCounts,hp:b.hp,enemyHp:b.enemyHp,board:b.board,charge:b.charge,armor:b.armor,moves:b.moves,status:b.status,countdown:b.countdown,hazards:b.hazards,poison:b.poison};}
try{browser=await chromium.launch({channel:'msedge',headless:true});for(const [index,width]of [320,390,430].entries()){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),pageErrors=[];activePage=page;page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/2048/?journey=three-acts');
 await page.getByRole('button',{name:'เลือกคู่หู · ทดลอง 3 ด่าน',exact:true}).click();await page.locator('[data-action=start]').click();await page.waitForFunction(()=>run?.phase==='battle'&&regionalActive(state));
 const observed={warning:false,crystal:false,crack:false,poison:false,phase2:false,roots:false},enemy=scenarios[index];
 for(let step=0;step<100;step++){
  const observation=await page.evaluate(()=>({warning:!!state.hazards?.warning,crystal:!!state.hazards?.crystals.length,crack:state.board.some(t=>t?.crack),poison:!!state.poison,phase2:state.hazards?.bossPhase===2,roots:state.board.some(t=>t?.f)}));
  for(const key in observed)if(observation[key])observed[key]=true;
  const visible=await page.evaluate(()=>({objects:state.hazards.crystals.length,warning:!!state.hazards.warning,cracks:state.board.filter(t=>t?.crack).length}));
  assert.equal(await page.locator('.regional-crystal').count(),visible.objects);assert.equal(await page.locator('.regional-warning').count(),Number(visible.warning));assert.equal(await page.locator('.regional-crack-count').count(),visible.cracks);
  if((enemy==='cave_guardian'&&observation.crystal)||(enemy==='sky_guardian'&&observation.poison)||(enemy==='stag'&&observation.phase2&&observation.roots)){
   const snapshot=await page.evaluate(()=>({run,state}));await page.screenshot({path:path.join(out,enemy+'-'+width+'.png')});
   offline=true;await page.evaluate(()=>{trackActSession('leave');flushCompetition();});await page.waitForFunction(()=>syncError);await page.reload();await page.getByRole('button',{name:'เล่นต่อ',exact:true}).click();
   const restored=await page.evaluate(()=>({run,state}));const before=gameplay(snapshot),after=gameplay(restored);delete before.sessions;delete after.sessions;assert.deepEqual(after,before);
   offline=false;drop=true;await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>!sending);await page.evaluate(()=>flushCompetition());await page.waitForFunction(()=>outbox.every(q=>!q.events.length));
   const client=await page.evaluate(()=>({run,state})),row=runs.get(client.run.competition.id);assert.deepEqual(gameplay(client),gameplay(row.snapshot));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#board').getBoundingClientRect().width<=innerWidth));
   results.push({enemy,width,observed,revision:row.revision,pageErrors,clientServerEqual:true});break;
  }
  const dir=await page.evaluate(()=>DIRS.map(d=>({dir:d,r:regionalSlide(state.board,d,state.cfg.rune,has('chain'),true,null,state)})).filter(x=>x.r.changed).sort((a,b)=>a.r.merges.length-b.r.merges.length)[0]?.dir);
  assert.ok(dir,'regional recovery must leave a legal move');const bounds=await page.locator('#board').boundingBox(),dx=dir==='left'?-60:dir==='right'?60:0,dy=dir==='up'?-60:dir==='down'?60:0,cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2,beforeMoves=await page.evaluate(()=>state.moves);const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-dx/2,y:cy-dy/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+dx/2,y:cy+dy/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await page.waitForFunction(n=>state.moves>n&&!busy,beforeMoves);
 }
 assert.equal(results.length,index+1,'did not observe target mechanic for '+enemy);assert.deepEqual(pageErrors,[]);await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
