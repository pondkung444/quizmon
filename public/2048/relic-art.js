'use strict';
// Stable relic IDs map to individually generated inventory art.
const relicArtPath=id=>'assets/icons/'+(RELIC_V1.find(r=>r.id===id)?.region?'relic-v2/':'relic-v1/')+id+'.webp';
const beforeRelicArtChoice=relicChoice;
relicChoice=function(id,shop=false){const choice=beforeRelicArtChoice(id,shop),relic=RELIC_V1.find(r=>r.id===id);return {...choice,title:choice.title.slice(relic.icon.length+1),art:relicArtPath(id)};};
function showRelicArtDetail(id){
 const relic=RELIC_V1.find(r=>r.id===id);if(!relic)return;
 panel(relic.name,relic.grade+(relic.cursed?' · ต้องสาป':'')+' · '+relic.desc,[{title:'กลับไปการเดินทาง',action:showPhase}]);
 const image=document.createElement('img');image.className='relic-detail-art';image.src=relicArtPath(id);image.alt=relic.name;
 document.querySelector('#run-content h2').before(image);
}
const beforeRelicArtHUD=runHUD;
runHUD=function(){
 beforeRelicArtHUD();if(!relicActive())return;
 document.querySelectorAll('#relics .owned-relic').forEach((button,index)=>{
  const id=run.relics[index],relic=RELIC_V1.find(r=>r.id===id);if(!relic)return;
  const image=document.createElement('img');image.src=relicArtPath(id);image.alt='';image.width=image.height=28;button.replaceChildren(image);
  if(relic.cursed)button.classList.add('relic-cursed');
  button.onclick=()=>showRelicArtDetail(id);
 });
};
