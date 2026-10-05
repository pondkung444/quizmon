'use strict';
// Stable relic IDs map to individually generated inventory art.
const relicArtPath=id=>'assets/icons/relic-v1/'+id+'.webp';
const beforeRelicArtChoice=relicChoice;
relicChoice=function(id,shop=false){const choice=beforeRelicArtChoice(id,shop),relic=RELIC_V1.find(r=>r.id===id);if(relic.region)return choice;return {...choice,title:choice.title.slice(relic.icon.length+1),art:relicArtPath(id)};};
function showRelicArtDetail(id){
 const relic=RELIC_V1.find(r=>r.id===id);if(!relic)return;
 panel(relic.name,relic.grade+(relic.cursed?' · ต้องสาป':'')+' · '+relic.desc,[{title:'กลับไปการเดินทาง',action:showPhase}]);
 if(relic.region)return;
 const image=document.createElement('img');image.className='relic-detail-art';image.src=relicArtPath(id);image.alt=relic.name;
 document.querySelector('#run-content h2').before(image);
}
const beforeRelicArtHUD=runHUD;
runHUD=function(){
 beforeRelicArtHUD();if(!relicActive())return;
 document.querySelectorAll('#relics .owned-relic').forEach((button,index)=>{
  const id=run.relics[index],relic=RELIC_V1.find(r=>r.id===id);if(!relic)return;
  if(relic.region)button.replaceChildren(relic.icon);else{const image=document.createElement('img');image.src=relicArtPath(id);image.alt='';image.width=image.height=28;button.replaceChildren(image);}
  if(relic.cursed)button.classList.add('relic-cursed');
  button.onclick=()=>showRelicArtDetail(id);
 });
};
