import Link from "next/link";
import SignOutLink from "@/components/SignOutLink";
import FarmRoster from "@/components/farm/FarmRoster";
import { loadFarmPets } from "@/lib/farm/server";

export default async function QmonResidencePage() {
  const pets = await loadFarmPets();
  return <main data-app-wide className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 p-6 pb-24 lg:max-w-[var(--app-frame-w)]">
    <SignOutLink />
    <Link href="/collection" className="inline-flex min-h-11 items-center self-start rounded-xl border border-gold-dim px-4 text-sm text-gold-hi">← กลับฟาร์ม</Link>
    <div><h1 className="text-2xl font-bold text-gold-hi">อาคารฟาร์ม Qmon</h1><p className="mt-1 text-sm text-text3">บ้านของ Qmon ร่าง 4 ที่เก็บเข้าฟาร์มแล้ว</p></div>
    <FarmRoster pets={pets} />
  </main>;
}

