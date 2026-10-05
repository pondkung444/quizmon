import {getUser} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {loadSchoolProject,loadSchoolPets} from "@/lib/farm/school-server";
import {loadBlueprintDiscoveries} from "@/lib/farm/blueprints-server";
import GardenLesson from "@/components/farm/GardenLesson";
export default async function GardenLessonPage(){
 if(!await getUser())redirect("/login");
 const [school,pets,discoveries]=await Promise.all([loadSchoolProject(),loadSchoolPets(),loadBlueprintDiscoveries()]);
 return <main data-app-wide><GardenLesson schoolPlaced={school?.status==="placed"} pets={pets} initialDiscovery={discoveries.find(d=>d.blueprint_id==="garden-rest-v1")??null}/></main>;
}
