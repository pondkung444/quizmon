'use strict';
// Keep secondary information available without reserving board space on phones.
const beforeMobileInfoRender=render;
render=function(){
 beforeMobileInfoRender();
 const relics=document.querySelector('#relics');
 if(!relics||relics.querySelector('.mobile-battle-info'))return;
 const info=document.createElement('button');
 info.className='mobile-battle-info';info.textContent='ⓘ';
 info.setAttribute('aria-label','วิธีเล่นและสถานะการต่อสู้');
 info.onclick=()=>{
  const regional=document.querySelector('#regional-status');
  const status=regional&&!regional.hidden?regional.textContent.trim():'';
  const relicStatus=Array.from(document.querySelectorAll('#relic-status button')).map(button=>button.getAttribute('aria-label')||button.title||button.textContent).join('\n');
  panel('วิธีเล่นและสถานะ','ปัด ↑ ↓ ← → เพื่อเลื่อนรูน\nดาบ · โจมตี   โล่ · เกราะ   ✚ · ฟื้น HP   ✦ · เทพพิทักษ์'+(status?'\n\n'+status:'')+(relicStatus?'\n\n'+relicStatus:''),[{title:'กลับไปเล่น',action:showPhase}]);
 };
 relics.insertBefore(info,relics.querySelector('.owned-relic')||relics.firstChild);
};
