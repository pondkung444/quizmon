import {getUser} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import FloorPractice from "@/components/farm/FloorPractice";
export default async function SchoolPracticePage(){
 if(!await getUser())redirect("/login");
 return <main data-app-wide><FloorPractice/></main>;
}
