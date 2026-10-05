'use strict';
function regionalPenalty(s){return s.enemy==='sky_guardian'?'ล้างเกราะ · เร่งหมัด · เพิ่มพิษ':s.enemy==='sky_heavy'?'ล้างเกราะ':s.enemy==='sky_haste'?'เร่งหมัด':s.enemy==='sky_poison'?'เพิ่มพิษ':'รูนหาย';}
const beforeRegionalRenderBoard=renderBoard;
renderBoard=function(){boardEl.querySelectorAll('.regional-crack-count').forEach(el=>el.remove());beforeRegionalRenderBoard();boardEl.querySelectorAll('.regional-object').forEach(el=>el.remove());if(!regionalActive(state))return;
 const h=regionalState(state);
 for(const c of h.crystals){const el=document.createElement('div');el.className='regional-object regional-crystal';el.dataset.cell=c.cell;el.setAttribute('role','img');el.setAttribute('aria-label','ผลึก '+c.layers+' ชั้น · รวมรูนข้างเคียงเพื่อทุบ');el.textContent='◆';const badge=document.createElement('span');badge.textContent=c.layers;el.append(badge);position(el,c.cell);boardEl.append(el);}
 if(h.warning){const el=document.createElement('div');el.className='regional-object regional-warning';el.dataset.cell=h.warning.cell;el.setAttribute('role','img');el.setAttribute('aria-label','ผลึกจะเกิดช่องนี้ใน 1 ปัด');el.textContent='◇ 1';position(el,h.warning.cell);boardEl.append(el);}
 state.board.forEach((t,i)=>{if(!t?.crack)return;const el=boardEl.querySelector('.tile[data-cell="'+i+'"]');if(!el)return;el.classList.add('regional-cracked');const badge=document.createElement('span');badge.className='regional-crack-count';badge.textContent='⚡ '+t.crack.remaining;el.append(badge);el.setAttribute('aria-label',el.getAttribute('aria-label')+' · ร้าวเหลือ '+t.crack.remaining+' ปัด · แตกแล้ว '+regionalPenalty(state));});
};
const beforeRegionalRender=render;
render=function(){beforeRegionalRender();let hud=document.querySelector('#regional-status');if(!regionalActive(state)){if(hud)hud.hidden=true;return;}if(!hud){hud=document.createElement('div');hud.id='regional-status';hud.setAttribute('aria-live','polite');document.querySelector('#boss-plan').after(hud);}hud.hidden=false;
 const h=regionalState(state),copy=[];
 if(regionalBoss(state))copy.push('บอสเฟส '+h.bossPhase+(h.pendingPhase?' · เฟส 2 เริ่มปัดถัดไป':''));
 if(regionalAct(state)===2)copy.push(regionalIntro(state)?'ห้องตั้งตัว · ไม่มีผลึก':'◆ '+h.crystals.length+' ก้อน · รวมข้างเคียงทุบ 1 ชั้น'+(h.warning?' · ◇ เตือนผลึกใน 1 ปัด':''));
 if(regionalAct(state)===3)copy.push(regionalIntro(state)?'ห้องตั้งตัว · ไม่มีรอยร้าว':'⚡ '+state.board.filter(t=>t?.crack).length+' รูนร้าว · รวมก่อนหมดเวลา · '+regionalPenalty(state));
 if(state.poison)copy.push('พิษ '+state.poison.stacks+' ชั้น · เหลือ '+state.poison.remaining+' ปัด · โจมตี/เกราะ −'+10*state.poison.stacks+'% · รวมรูนฮีลล้างพิษ');
 hud.textContent=copy.join(' | ');
 if(state.enemy==='stag')document.querySelector('#intent-power').textContent='พลัง '+enemyDamage(state)+' · พันราก '+(h.bossPhase===2?3:2)+' รูน';
};
const beforeRegionalHome=showHome;
showHome=function(){beforeRegionalHome();if(actPreviewRequested()){const note=document.querySelector('.forest-note');if(note)note.textContent='ฉบับทดลอง · ผลึกถ้ำ รูนร้าว พิษ และบอสสองเฟส · ผลรอบนี้ไม่รวมอันดับ Endless';}};
