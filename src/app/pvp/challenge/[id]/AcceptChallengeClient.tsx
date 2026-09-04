"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PvpChallengeForAccept, PvpPetPick } from "@/lib/pvp";
import type { RaidGearItemFull } from "@/lib/raid";
import { acceptPvpChallenge, declinePvpChallenge } from "../../actions";
import PvpPetPicker from "../../PvpPetPicker";
import PvpGearLoadout from "../../PvpGearLoadout";

export default function AcceptChallengeClient({
  challenge,
  pets,
  gearItems,
  lockedPetIds,
}: {
  challenge: PvpChallengeForAccept;
  pets: PvpPetPick[];
  gearItems: RaidGearItemFull[];
  lockedPetIds: string[];
}) {
  const router = useRouter();
  const [petId, setPetId] = useState<string | null>(pets[0]?.id ?? null);
  const [items, setItems] = useState<RaidGearItemFull[]>(gearItems);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedPet = pets.find((p) => p.id === petId) ?? null;
  const locked = petId ? lockedPetIds.includes(petId) : false;

  const accept = () => {
    if (!petId) return;
    setError(null);
    startTransition(async () => {
      const res = await acceptPvpChallenge(challenge.id, petId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.push(`/pvp/${res.data.matchId}`);
    });
  };

  const decline = () => {
    setError(null);
    startTransition(async () => {
      const res = await declinePvpChallenge(challenge.id);
      if (!res.ok) setError(res.message);
      else router.push("/pvp");
    });
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-gold-hi">รับคำท้า</h1>
      <p className="mt-2 text-sm text-text2">
        {challenge.challengerName} ท้าประลอง · ส่ง {challenge.challengerPetName} ลงสนาม
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-text2">เลือก Qmon ของคุณ</h2>
        <p className="mt-1 text-xs text-text3">เริ่มดวลทันทีเมื่อกดรับ</p>
        <div className="mt-2">
          <PvpPetPicker pets={pets} selectedId={petId} onSelect={setPetId} />
        </div>
        {selectedPet && (
          <PvpGearLoadout
            petId={selectedPet.id}
            baseStats={selectedPet.stats}
            items={items}
            setItems={setItems}
            locked={locked}
          />
        )}
      </section>

      {error && <p className="mt-4 text-sm text-red">{error}</p>}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={pending || !petId}
          onClick={accept}
          className="flex-1 rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {pending ? "กำลังเริ่ม…" : "รับคำท้า"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={decline}
          className="rounded-2xl border border-border px-4 py-3 text-sm text-text2 active:scale-95 disabled:opacity-50"
        >
          ปฏิเสธ
        </button>
      </div>
    </main>
  );
}
