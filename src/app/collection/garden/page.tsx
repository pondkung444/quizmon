
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getUser} from '@/lib/supabase/server';
import {loadGardenProjects,loadFarmWallet} from '@/lib/farm/garden-server';
import {loadSchoolPets,loadSchoolProject} from '@/lib/farm/school-server';
import {loadBlueprintDiscoveries} from '@/lib/farm/blueprints-server';
import GardenClient from '@/components/farm/GardenClient';
export default async function GardenPage(){
 if(!await getUser())redirect('/login');
 const [projects,wallet,pets,school,discoveries]=await Promise.all([loadGardenProjects(),loadFarmWallet(),loadSchoolPets(),loadSchoolProject(),loadBlueprintDiscoveries()]);
 return <main data-app-wide className="mx-auto w-full max-w-xl p-4 pb-24"><Link href="/collection" className="inline-flex min-h-11 items-center text-sm text-gold-hi">← กลับฟาร์ม</Link><GardenClient initialProjects={projects} wallet={wallet} pets={pets} unlocked={school?.status==='placed'&&discoveries.some(d=>d.blueprint_id==='garden-rest-v1')} serverNow={new Date().toISOString()}/></main>;
}
