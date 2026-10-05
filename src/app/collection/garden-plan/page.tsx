import {redirect} from 'next/navigation';
import {getUser} from '@/lib/supabase/server';
import {loadFarmPets} from '@/lib/farm/server';
import {loadSchoolProject} from '@/lib/farm/school-server';
import {INITIAL_FARM,type FarmTile} from '@/lib/farm/world';
import GardenPlacementPreview from '@/components/farm/GardenPlacementPreview';
export default async function GardenPlanPage(){
 if(!await getUser())redirect('/login');
 const [pets,school]=await Promise.all([loadFarmPets(),loadSchoolProject()]);
 const tiles:FarmTile[]=school?.status==='placed'&&school.tile_x!==null&&school.tile_y!==null?[...INITIAL_FARM,{id:'main-school',kind:'school',level:1,x:school.tile_x,y:school.tile_y}]:INITIAL_FARM;
 const examples=[{id:'example-garden-qmon',nickname:'Qmon ตัวอย่าง',speciesName:'Qmon ตัวอย่าง',imagePath:'/pets/egg2_stage2_baby.png'}];
 return <GardenPlacementPreview tiles={tiles} pets={pets.length?pets.slice(0,3):examples}/>;
}
