"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { PvpOpenChallenge, PvpPetPick } from "@/lib/pvp";
import type { RaidGearItemFull } from "@/lib/raid";
import { acceptOpenPvpChallenge } from "../../actions";
import PvpPetPicker from "../../PvpPetPicker";
import PvpGearLoadout from "../../PvpGearLoadout";
import { track } from "@/lib/analytics";

export default function AcceptOpenChallengeClient({ challenge, pets, gearItems, lockedPetIds, ticketBalance }: {
  challenge: PvpOpenChallenge; pets: PvpPetPick[]; gearItems: RaidGearItemFull[];
  lockedPetIds: string[]; ticketBalance: number;
}) {
  const router = useRouter();
  const [petId, setPetId] = useState<string | null>(pets[0]?.id ?? null);
  const [items, setItems] = useState(gearItems);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lock = useRef(false);
  const selectedPet = pets.find(p => p.id === petId);
  const accept = () => {
    if (!petId || lock.current) return;
    lock.current = true; setError(null);
    startTransition(async () => {
      try {
        const result = await acceptOpenPvpChallenge(challenge.id, petId);
        if (!result.ok) { setError(result.message); router.refresh(); return; }
        track("pvp_open_accepted", { challenge_id: challenge.id, match_id: result.data.matchId }, petId);
        router.push(`/pvp/${result.data.matchId}`);
      } catch { setError("เชื่อมต่อไม่สำเร็จ ตรวจหน้าประลองก่อนลองใหม่"); }
      finally { lock.current = false; }
    });
  };
  return <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
    <h1 className="text-2xl font-bold text-gold-hi">รับคำท้าเปิด</h1>
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <Image src={challenge.imagePath} alt="" width={64} height={64} unoptimized />
      <div><p className="font-bold text-text">{challenge.petName}</p>
        <p className="text-xs text-text3">ชื่อผู้เล่นจะเปิดเผยเมื่อเริ่มแมตช์</p></div>
    </div>
    <p className="mt-3 text-xs text-text3">เลือก Qmon ระยะ 4 และอุปกรณ์ · ใช้ตั๋วเมื่อรับสำเร็จเท่านั้น</p>
    <section className="mt-6"><h2 className="mb-2 text-sm font-bold text-text2">เลือก Qmon ของคุณ</h2>
      <PvpPetPicker pets={pets} selectedId={petId} onSelect={setPetId} />
      {selectedPet && <PvpGearLoadout petId={selectedPet.id} baseStats={selectedPet.stats}
        items={items} setItems={setItems} locked={lockedPetIds.includes(selectedPet.id)} />}
    </section>
    {error && <p className="mt-4 text-sm text-red">{error}</p>}
    <button type="button" onClick={accept} disabled={pending || !petId || ticketBalance <= 0}
      className="mt-6 w-full rounded-2xl border border-gold bg-amber py-3 font-bold text-on-amber disabled:opacity-50">
      {pending ? "กำลังรับคำท้า…" : "รับคำท้าและเริ่มแมตช์"}
    </button>
  </main>;
}
