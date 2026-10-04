import Link from "next/link";
import SignOutLink from "@/components/SignOutLink";
import FarmEggsTabs from "@/components/FarmEggsTabs";
import FarmMeadow from "@/components/farm/FarmMeadow";
import { loadFarmPets } from "@/lib/farm/server";

export default async function CollectionFarmPage() {
  const pets = await loadFarmPets();
  return <main data-app-wide className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 p-6 pb-24 lg:max-w-[var(--app-frame-w)]">
    <FarmEggsTabs active="farm" />
    <SignOutLink />
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-gold-hi">ฟาร์ม</h1><p className="text-sm text-text3">แตะอาคารเพื่อดูคู่หูและไข่ที่มี</p></div>
      <Link href="/collection/album" className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-gold-dim bg-card px-3 text-xs font-bold text-gold-hi">สมุดสะสม</Link>
    </div>
    <FarmMeadow pets={pets} />
  </main>;
}
