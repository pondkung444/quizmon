"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PvpChallengeForAccept, PvpPetPick } from "@/lib/pvp";
import type { RaidGearItemFull } from "@/lib/raid";
import { acceptPvpChallenge, declinePvpChallenge } from "../../actions";
import PvpPetPicker from "../../PvpPetPicker";
import PvpGearLoadout from "../../PvpGearLoadout";
import PvpExpectations from "../../PvpExpectations";

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
  const actionLock = useRef(false);

  const selectedPet = pets.find((p) => p.id === petId) ?? null;
  const locked = petId ? lockedPetIds.includes(petId) : false;

  const accept = () => {
    if (!petId || actionLock.current) return;
    actionLock.current = true;
    setError(null);
    startTransition(async () => {
      try {
      const res = await acceptPvpChallenge(challenge.id, petId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.push(`/pvp/${res.data.matchId}`);
      } catch { setError("เชื่อมต่อไม่สำเร็จ กลับหน้าประลองเพื่อตรวจสถานะก่อนลองใหม่"); }
      finally { actionLock.current = false; }
    });
  };

  const decline = () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setError(null);
    startTransition(async () => {
      try {
      const res = await declinePvpChallenge(challenge.id);
      if (!res.ok) setError(res.message);
      else router.push("/pvp");
      } catch { setError("เชื่อมต่อไม่สำเร็จ ตรวจสถานะอีกครั้งก่อนลองใหม่"); }
      finally { actionLock.current = false; }
    });
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-gold-hi">รับคำท้า</h1>
      <PvpExpectations />
      <p className="mt-2 text-sm text-text2">
        {challenge.challengerName} ท้าประลอง · ส่ง {challenge.challengerPetName} ลงสนาม
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-text2">เลือก Qmon ของคุณ</h2>
        <p className="mt-1 text-xs text-text3">สร้างแมตช์เมื่อกดรับ · เวลาตอบยังไม่เริ่มจนกด “เริ่มตอบ”</p>
        <div className="mt-2">
          <PvpPetPicker pets={pets} selectedId={petId} onSelect={setPetId} />
        </div>
        {selectedPet &&
          (selectedPet.stage === 4 ? (
            <PvpGearLoadout
              petId={selectedPet.id}
              baseStats={selectedPet.stats}
              items={items}
              setItems={setItems}
              locked={locked}
            />
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-text3">
              อุปกรณ์มีผลเฉพาะ Qmon ระดับสูงสุด (ระยะ 4) เท่านั้น
            </p>
          ))}
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
