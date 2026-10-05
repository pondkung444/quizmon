import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import vm from 'node:vm';
const out=path.resolve('output/acts-phase5');
const jobs=JSON.parse(fs.readFileSync(path.join(out,'generation-inputs.json'),'utf8'));
const rows=[];
for(const job of jobs){
 const scene=job.kind==='scene',size=scene?1024:job.kind==='relic'?256:640;
 const target=path.resolve('public/2048/assets',job.kind==='relic'?'icons/relic-v2':'acts-v1',job.id+'.webp');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 const pipeline=sharp(job.source);
 const input=await pipeline.metadata();
 if(!scene&&!input.hasAlpha)throw Error(job.id+': missing transparency');
 await pipeline.resize({width:size,height:scene?1536:size,fit:scene?'cover':'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:scene?82:88,alphaQuality:100,effort:5}).toFile(target);
 const meta=await sharp(target).metadata(),stats=await sharp(target).stats();
 if(!scene&&stats.channels[3]?.min!==0)throw Error(job.id+': opaque background');
 rows.push({id:job.id,kind:job.kind,path:path.relative(process.cwd(),target).replaceAll('\\','/'),bytes:fs.statSync(target).size,width:meta.width,height:meta.height,alpha:meta.hasAlpha});
}
fs.writeFileSync(path.join(out,'assets.json'),JSON.stringify(rows,null,2));
for(const kind of ['sprite','relic']){
 const group=rows.filter(r=>r.kind===kind),columns=kind==='relic'?5:4,w=210,h=240;
 const overlays=[];
 for(const [i,r]of group.entries()){
  const x=i%columns*w,y=Math.floor(i/columns)*h;
  overlays.push({input:await sharp(r.path).resize(170,180,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).toBuffer(),left:x+20,top:y+5});
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="210" height="48"><text x="105" y="25" font-size="15" font-family="Arial" text-anchor="middle" fill="#eddfb4">'+r.id+'</text></svg>';
  overlays.push({input:Buffer.from(svg),left:x,top:y+190});
 }
 await sharp({create:{width:columns*w,height:Math.ceil(group.length/columns)*h,channels:4,background:'#09262d'}}).composite(overlays).png().toFile(path.join(out,kind+'-contact-sheet.png'));
}
console.log(JSON.stringify({assets:rows.length,totalBytes:rows.reduce((n,r)=>n+r.bytes,0),sprites:rows.filter(r=>r.kind==='sprite').length,relics:rows.filter(r=>r.kind==='relic').length,scenes:rows.filter(r=>r.kind==='scene').length}));

const artSource=fs.readFileSync('public/2048/act-art.js','utf8').match(/const ACT_ART=(\{[\s\S]*?\n\});/);
const artMap=vm.runInNewContext('('+artSource[1]+')');
const all=Object.entries(artMap),cols=5,cellW=210,cellH=230,parts=[];
for(const [i,[id,item]]of all.entries()){
 const x=i%cols*cellW,y=Math.floor(i/cols)*cellH;
 parts.push({input:await sharp(path.join('public/2048',item.src)).resize(180,180,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).toBuffer(),left:x+15,top:y+5});
 parts.push({input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="40"><text x="105" y="25" font-size="15" font-family="Arial" text-anchor="middle" fill="#eddfb4">'+id+'</text></svg>'),left:x,top:y+185});
}
await sharp({create:{width:cols*cellW,height:Math.ceil(all.length/cols)*cellH,channels:4,background:'#09262d'}}).composite(parts).png().toFile(path.join(out,'all-enemies-contact-sheet.png'));
