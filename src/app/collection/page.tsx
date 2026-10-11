import {loadFarmLayoutIfAvailable} from "@/lib/farm/layout-server";
import {loadGardenProjects,loadFarmWallet} from '@/lib/farm/garden-server';
import {gardenTiles} from '@/lib/farm/garden';
import FarmMeadow from "@/components/farm/FarmMeadow";
import { loadFarmPets } from "@/lib/farm/server";
import { loadSchoolProject,loadConfirmedSchoolLevel } from "@/lib/farm/school-server";
import { INITIAL_FARM, type FarmTile } from "@/lib/farm/world";

export default async function CollectionFarmPage({searchParams}:{searchParams:Promise<{place?:string}>}) {
  const [pets,school,params,gardens,wallet,schoolLevel,unifiedLayout] = await Promise.all([loadFarmPets(),loadSchoolProject(),searchParams,loadGardenProjects(),loadFarmWallet(),loadConfirmedSchoolLevel(),loadFarmLayoutIfAvailable()]);
  const tiles: FarmTile[] = school?.status === "placed" && school.tile_x !== null && school.tile_y !== null
    ? [...INITIAL_FARM,{id:"main-school",kind:"school",level:schoolLevel,x:school.tile_x,y:school.tile_y}]
    : [...INITIAL_FARM];
  tiles.push(...gardenTiles(gardens));
  return <main data-app-wide className="w-full min-h-[100dvh] pb-20"><FarmMeadow walletBalance={wallet.balance} gardenActive={gardens.some(p=>p.status!=='placed')} pets={pets} layoutAvailable={!!unifiedLayout} tiles={unifiedLayout??tiles} school={school} placing={school?.status==="ready" && params.place==="school"} /></main>;
}
