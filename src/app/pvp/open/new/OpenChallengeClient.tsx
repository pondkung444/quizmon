"use client";

import { useEffect, useRef, useState } from "react";
import type { PvpPetPick } from "@/lib/pvp";
import type { RaidGearItemFull } from "@/lib/raid";
import { createOpenPvpChallenge } from "../../actions";
import PvpPetPicker from "../../PvpPetPicker";
import PvpGearLoadout from "../../PvpGearLoadout";
import { track } from "@/lib/analytics";

export default function OpenChallengeClient({ pets, ticketBalance, gearItems, lockedPetIds, hasPending }: {
  pets: PvpPetPick[]; ticketBalance: number; gearItems: RaidGearItemFull[];
  lockedPetIds: string[]; hasPending: boolean;
}) {
  const [petId, setPetId] = useState<string | null>(pets[0]?.id ?? null);
  const [items, setItems] = useState(gearItems);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(false);
  const [slow, setSlow] = useState(false);
  const lock = useRef(false);
  const selectedPet = pets.find(p => p.id === petId);
  useEffect(() => {
    if (!pending || created) return;
    const timeout = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [pending, created]);
  const submit = async () => {
    if (!petId || ticketBalance <= 0 || hasPending || lock.current) return;
    lock.current = true;
    setPending(true);
    setSlow(false);
    setError(null);
    let saved = false;
    try {
      const result = await createOpenPvpChallenge(petId);
      if (!result.ok) {
        setError(result.message);
        setPending(false);
        lock.current = false;
        return;
      }
      saved = true;
      setCreated(true);
      try { track("pvp_open_created", { challenge_id: result.data.challengeId }, petId); } catch { /* analytics must not block navigation */ }
      window.location.replace("/pvp");
    } catch {
      setError(saved
        ? "เปิดคำท้าแล้ว กดกลับหน้าประลองด้านล่างได้เลย"
        : "เชื่อมต่อไม่สำเร็จ ตรวจคำท้าที่หน้าประลองก่อนลองใหม่");
      setPending(false);
      if (!saved) lock.current = false;
    }
  };
  return <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
    <h1 className="text-2xl font-bold text-gold-hi">เปิดคำท้าประลอง</h1>
    <p className="mt-2 text-sm text-text2">เลือก Qmon ระยะ 4 และจัดอุปกรณ์ก่อนเปิดคำท้า คนระดับเดียวกันกดรับได้ทันที</p>
    <p className="mt-1 text-xs text-text3">ใช้ตั๋ว 1 ใบ · ยกเลิกหรือหมดอายุใน 24 ชั่วโมงจะได้คืน</p>
    {hasPending && <p className="mt-4 rounded-xl border border-gold-dim p-3 text-sm text-text2">คุณมีคำท้าเปิดค้างอยู่แล้ว กลับไปยกเลิกหรือรอคนรับก่อน</p>}
    {pets.length === 0 && <p className="mt-4 text-sm text-text2">ต้องมี Qmon ระยะ 4 ก่อนเปิดคำท้า</p>}
    <section className="mt-6"><h2 className="mb-2 text-sm font-bold text-text2">เลือก Qmon</h2>
      <PvpPetPicker pets={pets} selectedId={petId} onSelect={setPetId} />
      {selectedPet && <PvpGearLoadout petId={selectedPet.id} baseStats={selectedPet.stats}
        items={items} setItems={setItems} locked={lockedPetIds.includes(selectedPet.id)} />}
    </section>
    {error && <p className="mt-4 text-sm text-red">{error}</p>}
    {created && <p className="mt-4 text-sm text-text2">เปิดคำท้าแล้ว กำลังกลับหน้าประลอง… <button type="button" onClick={() => window.location.replace("/pvp")} className="font-bold text-gold-hi underline">กลับหน้าประลอง</button></p>}
    {pending && slow && !created && <p className="mt-4 text-sm text-text2">รอนานกว่าปกติ <button type="button" onClick={() => window.location.replace("/pvp")} className="font-bold text-gold-hi underline">กลับหน้าประลองเพื่อตรวจคำท้า</button></p>}
    <button type="button" onClick={submit} disabled={pending || created || hasPending || !petId || ticketBalance <= 0}
      className="mt-6 w-full rounded-2xl border border-gold bg-amber py-3 font-bold text-on-amber disabled:opacity-50">
      {created ? "เปิดคำท้าแล้ว" : pending ? "กำลังเปิดคำท้า…" : "เปิดคำท้าและรอคนรับ"}
    </button>
  </main>;
}
