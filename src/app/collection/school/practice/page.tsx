import Link from "next/link";
import {getUser} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import FloorPractice from "@/components/farm/FloorPractice";
export default async function SchoolPracticePage(){
 if(!await getUser())redirect("/login");
 return <main data-app-wide className="mx-auto w-full max-w-xl p-4 pb-24 lg:max-w-[var(--app-frame-w)]">
  <Link href="/collection/school" className="inline-flex min-h-11 items-center text-sm text-gold-hi">← กลับโรงเรียน</Link>
  <FloorPractice/>
 </main>;
}
