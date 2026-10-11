"use client";
import { useState } from "react";
import Link from "next/link";
import type { StickerDay } from "@/lib/farm/social-server";
import { FARM_STICKERS } from "@/lib/farm/social";
import {
  saveVisitPreference,
  readFarmEncouragement,
} from "@/app/collection/encouragement/actions";
export default function FarmEncouragementClient({
  enabled,
  inbox,
}: {
  enabled: boolean;
  inbox: StickerDay[];
}) {
  const [open, setOpen] = useState(enabled),
    [days, setDays] = useState(inbox),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function act(f: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await f();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-24">
      <Link className="inline-flex min-h-11 items-center" href="/collection">
        ← ฟาร์มของเรา
      </Link>
      <h1 className="text-xl font-bold">เยี่ยมฟาร์มและกำลังใจ</h1>
      <label className="flex min-h-11 gap-3">
        <input
          type="checkbox"
          checked={open}
          disabled={busy}
          onChange={(e) =>
            act(async () =>
              setOpen(await saveVisitPreference(e.target.checked)),
            )
          }
        />
        เปิดให้เพื่อนเยี่ยมฟาร์ม
      </label>
      <p>
        เฉพาะเพื่อนที่ไม่ได้บล็อกกัน เห็นผังและผลงาน
        ไม่เห็นเหรียญหรืองานที่ยังไม่เสร็จ
      </p>
      {message && <p role="alert">{message}</p>}
      <h2 className="font-bold">กำลังใจรวมรายวัน · 30 วันที่ผ่านมา</h2>
      {days.length ? (
        <>
          {days.some((d) => d.unread > 0) && (
            <button
              className="min-h-11 rounded bg-white/10 px-3"
              disabled={busy}
              onClick={() =>
                act(async () => setDays(await readFarmEncouragement()))
              }
            >
              อ่านกำลังใจทั้งหมด
            </button>
          )}
          <ul className="space-y-4">
            {days.map((d) => (
              <li className="rounded-xl border border-white/20 p-3" key={d.day}>
                <strong>
                  {d.day} · {d.total} กำลังใจ
                  {d.unread ? " · ยังไม่อ่าน " + d.unread : ""}
                </strong>
                <p>
                  {FARM_STICKERS.filter((s) => d.stickers[s.id])
                    .map((s) => `${s.icon} ${s.label} ${d.stickers[s.id]}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>ยังไม่มีกำลังใจในช่วงนี้</p>
      )}
      <Link
        className="inline-flex min-h-11 items-center underline"
        href="/social?tab=friends"
      >
        ไปเยี่ยมฟาร์มเพื่อน →
      </Link>
    </main>
  );
}
