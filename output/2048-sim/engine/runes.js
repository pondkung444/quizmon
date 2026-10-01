'use strict';
const EGG_RUNES={
 egg1:{name:'แก่นเพลิง',icon:'🔥',color:'255,120,50',desc:'ตี 60% · เผาอีก 30% สองปัด ซ้อนแยกก้อน'},
 egg2:{name:'แก่นพฤกษ์',icon:'🌱',color:'140,210,90',desc:'เกราะ 70% · ฟื้น 20% สองปัด ซ้อนแยกก้อน'},
 egg4:{name:'ฤทธิ์ธาร',icon:'❄',color:'140,220,255',desc:'เกราะ 90% · ทุก 3 คู่ชะลอศัตรู 1 ปัด'},
 egg5:{name:'ศักดิ์นภา',icon:'ϟ',color:'180,145,255',desc:'ตี 90% · ทุก 2 คู่เพิ่มชาร์จสกิล 1'},
 egg6:{name:'ศักดิ์ธรา',icon:'⛰',color:'230,170,80',desc:'เกราะ 110% · เก็บแรง 40% ของเกราะไว้สวน'},
 egg3:{name:'เทพทิพย์',icon:'✦',color:'255,235,150',desc:'ตี 100% เกราะ 70% ฮีล 40% · เทพรวมเทพ หรือเลข 64 ตื่นพลังออกสองรอบ'}
};
function runeState(s){return s.runes??={burn:[],bloom:[],quake:[],cold:0,spark:0,nextId:1};}
function runePower(s,value,factor=1){const scale=(value/4)**.8*factor;return{a:scale*s.cfg.attack,d:scale*s.cfg.armor,h:scale*s.cfg.hp*s.cfg.heal/100};}
function addRuneStack(s,key,power){const r=runeState(s);r[key].push({id:r.nextId++,source:s.cfg.rune,power,remaining:2});}
function runeTick(s){const r=runeState(s);let burn=0,heal=0;for(const g of r.burn){burn+=g.power;g.remaining--;}for(const g of r.bloom){heal+=g.power;g.remaining--;}r.burn=r.burn.filter(g=>g.remaining>0);r.bloom=r.bloom.filter(g=>g.remaining>0);return{burn:Math.floor(burn),heal:Math.floor(heal)};}
function baseRuneMerge(s,t,factor,critical){const r=runeState(s),p=runePower(s,t.v,factor),out={a:0,d:0,h:0};
 switch(s.cfg.rune){
 case 'egg1':out.a=Math.floor(p.a*.6*critical);addRuneStack(s,'burn',p.a*.3);break;
 case 'egg2':out.d=Math.floor(p.d*.7);addRuneStack(s,'bloom',p.h*.2);break;
 case 'egg4':out.d=Math.floor(p.d*.9);r.cold++;break;
 case 'egg5':out.a=Math.floor(p.a*.9*critical);r.spark++;break;
 case 'egg6':out.d=Math.floor(p.d*1.1);r.quake.push({id:r.nextId++,source:'egg6',power:out.d*.4});break;
 case 'egg3':{const repeats=t.awake?2:1;out.a=Math.floor(p.a*critical)*repeats;out.d=Math.floor(p.d*.7)*repeats;out.h=Math.floor(p.h*.4)*repeats;break;}
 }return out;
}
function runeAfterMerges(s,merges){const r=runeState(s);if(!merges.some(t=>t.t==='x'))return;
 if(s.cfg.rune==='egg4'&&r.cold>=3){r.cold-=3;s.countdown++;log(s,'❄ ความเย็นชะลอศัตรู 1 ปัด');}
 if(s.cfg.rune==='egg5'&&r.spark>=2&&s.charge<s.cfg.cooldown){r.spark-=2;s.charge++;if(s.cfg.skillVersion)autoSpark(s);log(s,'ϟ สายฟ้าเพิ่มชาร์จสกิล 1');}
}
function runeCounter(s){const r=runeState(s),power=Math.floor(r.quake.reduce((n,g)=>n+g.power,0));r.quake=[];return power;}
// Future Qmon skills use these explicit hooks; none are assigned to a species yet.
function awakenRune(s,index){const t=s.board[index];if(s.cfg.rune!=='egg3'||t?.t!=='x')return false;t.awake=true;return true;}
function convertRune(s,index){const t=s.board[index];if(!EGG_RUNES[s.cfg.rune]||!t)return false;t.t='x';delete t.awake;if(s.cfg.rune==='egg3'&&t.v>=64)t.awake=true;return true;}
function consumeRuneStacks(s,key){const r=runeState(s);if(!['burn','bloom','quake'].includes(key))return[];const stacks=r[key];r[key]=[];return stacks;}
function runeStatus(s){const r=runeState(s);return[r.burn.length?'🔥 '+r.burn.length+' ก้อน':'',r.bloom.length?'🌱 '+r.bloom.length+' ก้อน':'',r.cold?'❄ '+r.cold+'/3':'',r.spark?'ϟ '+r.spark+'/2':'',r.quake.length?'⛰ '+Math.floor(r.quake.reduce((n,g)=>n+g.power,0)):''].filter(Boolean).join(' · ');}

function runeMerge(s,t,factor,critical){return s.cfg.skillVersion?autoRuneMerge(s,t,factor,critical,baseRuneMerge):baseRuneMerge(s,t,factor,critical);}
