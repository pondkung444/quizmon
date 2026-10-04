import Image from "next/image";
import Link from "next/link";
import type { FarmPet } from "./FarmMeadow";

export default function FarmRoster({ pets }: { pets: readonly FarmPet[] }) {
  return <section aria-label="Qmon ร่าง 4 ที่มี" className="flex flex-col gap-4">
    <p className="text-sm text-text3">{pets.length} ตัว · แตะการ์ดเพื่อดูรายละเอียดของแต่ละตัว</p>
    {pets.length === 0 ? <div className="rounded-2xl border border-gold-dim bg-card p-6 text-center">
      <p className="font-bold text-gold-hi">ยังไม่มี Qmon ร่าง 4 ในฟาร์ม</p>
      <p className="mt-2 text-sm text-text3">เลี้ยงคู่หูจนโตเต็มวัย แล้วเก็บเข้าฟาร์มเพื่อมาอยู่ด้วยกัน</p>
      <Link href="/pet" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-gold-hi px-4 text-sm font-bold text-track">ไปดูคู่หูที่กำลังเลี้ยง</Link>
    </div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {pets.map(pet => <Link key={pet.id} href={`/collection/${pet.id}`} aria-label={`ดูรายละเอียด ${pet.nickname ?? pet.speciesName}`} className="flex flex-col items-center gap-2 rounded-2xl border border-gold-dim bg-card p-4 text-center focus-visible:outline-2 focus-visible:outline-gold-hi">
        <Image src={pet.imagePath} alt="" width={100} height={100} sizes="100px" className="h-24 w-24 object-contain" />
        <strong className="w-full break-words text-sm text-gold-hi">{pet.nickname ?? pet.speciesName}</strong>
        <span className="text-xs text-text3">{pet.speciesName} · ร่าง 4</span>
        <span className="text-xs text-gold-hi">ดูรายละเอียด →</span>
      </Link>)}
    </div>}
  </section>;
}
