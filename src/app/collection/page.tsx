import FarmMeadow from "@/components/farm/FarmMeadow";
import { loadFarmPets } from "@/lib/farm/server";
import { loadSchoolProject } from "@/lib/farm/school-server";
import { INITIAL_FARM, type FarmTile } from "@/lib/farm/world";

export default async function CollectionFarmPage({searchParams}:{searchParams:Promise<{place?:string}>}) {
  const [pets,school,params] = await Promise.all([loadFarmPets(),loadSchoolProject(),searchParams]);
  const tiles: FarmTile[] = school?.status === "placed" && school.tile_x !== null && school.tile_y !== null
    ? [...INITIAL_FARM,{id:"main-school",kind:"school",level:1,x:school.tile_x,y:school.tile_y}]
    : INITIAL_FARM;
  return <main data-app-wide className="w-full min-h-[100dvh] pb-20"><FarmMeadow pets={pets} tiles={tiles} school={school} placing={school?.status==="ready" && params.place==="school"} /></main>;
}
