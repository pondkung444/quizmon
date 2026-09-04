"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChallengeableFriend, PvpPetPick } from "@/lib/pvp";
import { createPvpChallenge } from "../actions";
import PvpPetPicker from "../PvpPetPicker";

export default function NewChallengeClient({
  friends,
  pets,
  ticketBalance,
}: {
  friends: ChallengeableFriend[];
  pets: PvpPetPick[];
  ticketBalance: number;
}) {
  const router = useRouter();
  const [friendId, setFriendId] = useState<string | null>(friends[0]?.userId ?? null);
  const [petId, setPetId] = useState<string | null>(pets[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!friendId || !petId) return;
    setError(null);
    startTransition(async () => {
      const res = await createPvpChallenge(friendId, petId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.push("/pvp");
    });
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gold-hi">ท้าประลอง</h1>
        <span className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-text2">
          🎟️ {ticketBalance}
        </span>
      </div>
      {ticketBalance <= 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-text3">
          ตั๋วประลองหมด — เติมวันละ 2 ใบ หรือได้เพิ่ม 1 ใบต่อการผจญภัยที่จบ
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-bold text-text2">เลือกเพื่อน</h2>
        {friends.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-4 text-center text-xs text-text3">
            ยังไม่มีเพื่อนระดับชั้นเดียวกัน — เพิ่มเพื่อนก่อนในหน้าสังคม
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {friends.map((f) => (
              <button
                key={f.userId}
                type="button"
                onClick={() => setFriendId(f.userId)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  friendId === f.userId
                    ? "border-gold bg-amber/10"
                    : "border-border bg-card"
                }`}
              >
                <span className="text-sm font-bold text-text">{f.username}</span>
                {friendId === f.userId && <span className="text-xs text-gold-hi">เลือกแล้ว</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-text2">เลือก Qmon (ระดับสูงสุด)</h2>
        <p className="mt-1 text-xs text-text3">อีกฝ่ายจะไม่เห็นว่าคุณเลือกตัวไหนจนกว่าจะเริ่มดวล</p>
        <div className="mt-2">
          <PvpPetPicker pets={pets} selectedId={petId} onSelect={setPetId} />
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-red">{error}</p>}

      <button
        type="button"
        disabled={pending || !friendId || !petId || ticketBalance <= 0}
        onClick={submit}
        className="mt-6 w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {pending ? "กำลังส่งคำท้า…" : "ส่งคำท้า"}
      </button>
    </main>
  );
}
