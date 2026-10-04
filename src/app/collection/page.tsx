import FarmMeadow from "@/components/farm/FarmMeadow";
import { loadFarmPets } from "@/lib/farm/server";

export default async function CollectionFarmPage() {
  const pets = await loadFarmPets();
  return <main data-app-wide className="w-full min-h-[100dvh] pb-20"><FarmMeadow pets={pets} /></main>;
}
