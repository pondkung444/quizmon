
import {redirect} from 'next/navigation';
import {getUser} from '@/lib/supabase/server';
import {loadGardenProjects} from '@/lib/farm/garden-server';
import {loadSchoolProject} from '@/lib/farm/school-server';
import {loadFarmPets} from '@/lib/farm/server';
import {INITIAL_FARM,type FarmTile} from '@/lib/farm/world';
import {gardenTiles} from '@/lib/farm/garden';
import GardenPlacementPreview from '@/components/farm/GardenPlacementPreview';
export default async function GardenPlacePage({searchParams}:{searchParams:Promise<{project?:string}>}){
 if(!await getUser())redirect('/login');
 const [params,projects,school,pets]=await Promise.all([searchParams,loadGardenProjects(),loadSchoolProject(),loadFarmPets()]);
 const project=projects.find(p=>p.id===params.project);if(project?.status!=='ready')redirect('/collection/garden');
 const tiles:FarmTile[]=[...INITIAL_FARM,...gardenTiles(projects)];
 if(school?.status==='placed'&&school.tile_x!==null&&school.tile_y!==null)tiles.push({id:'main-school',kind:'school',level:1,x:school.tile_x,y:school.tile_y});
 return <GardenPlacementPreview tiles={tiles} pets={pets.slice(0,3)} projectId={project.id}/>;
}
