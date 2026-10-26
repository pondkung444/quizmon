"use client";
import { useState } from "react";
import Link from "next/link";
import FarmWorld from "./FarmWorld";
import type { FriendFarm } from "@/lib/farm/social-server";
import { FARM_STICKERS, type FarmSticker } from "@/lib/farm/social";
import { sendSticker } from "@/app/collection/encouragement/actions";
const labels = {
  school: "โรงเรียน",
  garden: "สวนพักผ่อน",
  pond: "บ่อน้ำ",
  flower: "แปลงดอกไม้",
  bridge: "สะพาน",
  observatory: "หอดูดาว",
};
export default function VisitFarmClient({
  owner,
  farm,
  send = sendSticker,
}: {
  owner: string;
  farm: FriendFarm;
  send?: typeof sendSticker;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [sent, setSent] = useState(farm.sentToday),
    [remaining, setRemaining] = useState(farm.remainingToday),
    [pending, setPending] = useState<{
      sticker: FarmSticker;
      request: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const place = farm.places.find((p) => p.id === selected);
  async function sticker(id: FarmSticker) {
    const attempt = pending ?? { sticker: id, request: crypto.randomUUID() };
    setPending(attempt);
    setBusy(true);
    setMessage("");
    try {
      const result = await send(owner, attempt.sticker, attempt.request);
      setSent(result.sentToday);
      setRemaining(result.remainingToday);
      setPending(null);
      setMessage(
        result.created
          ? "ส่งกำลังใจแล้ว · ไม่เพิ่มเหรียญหรือเวลาให้เพื่อน"
          : "ส่งให้เพื่อนคนนี้วันนี้แล้ว",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "ส่งไม่สำเร็จ ลองสติกเกอร์เดิมอีกครั้งได้",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main data-app-wide className="mx-auto max-w-4xl space-y-4 p-3 pb-24">
      <Link
        className="inline-flex min-h-11 items-center"
        href="/social?tab=friends"
      >
        ← รายชื่อเพื่อน
      </Link>
      <h1 className="text-xl font-bold">ฟาร์มของ {farm.username}</h1>
      <p>เยี่ยมชมและส่งกำลังใจ · เปลี่ยนผังหรือช่วยทำโจทย์แทนเจ้าของไม่ได้</p>
      <FarmWorld
        tiles={farm.tiles}
        pets={[]}
        paused
        focusedId={null}
        onSelect={() => {}}
        onInspectTile={(t) => setSelected(t.id)}
      />
      <section className="space-y-2" aria-label="สถานที่ในฟาร์ม">
        <h2 className="font-bold">เลือกดูผลงานแต่ละสถานที่</h2>
        <div className="grid grid-cols-2 gap-2">
          {farm.places.map((p) => (
            <button
              key={p.id}
              className="min-h-11 rounded border border-white/20 p-2 text-left"
              onClick={() => setSelected(p.id)}
            >
              ดู{labels[p.kind]} ({farm.tiles.find((t) => t.id === p.id)?.x},{" "}
              {farm.tiles.find((t) => t.id === p.id)?.y})
            </button>
          ))}
        </div>
      </section>
      {place && (
        <section data-farm-panel className="space-y-2">
          <h2 className="font-bold">
            {labels[place.kind]}
            {place.kind === "school" ? " ระดับ " + place.level : ""}
          </h2>
          <p>
            วันที่บันทึกเก็บงานเสร็จ{" "}
            {place.completedAt
              ? new Date(place.completedAt).toLocaleString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })
              : "ยังไม่มีข้อมูลวันเดิม"}
          </p>
          <h3>ผู้ร่วมสร้าง</h3>
          {place.contributors.length ? (
            <ul>
              {place.contributors.map((p, i) => (
                <li key={i}>
                  {p.name} ·{" "}
                  {p.role === "leader"
                    ? "หัวหน้าทีม"
                    : p.role === "helper"
                      ? "ผู้ช่วย"
                      : "ร่วมสร้าง"}
                </li>
              ))}
            </ul>
          ) : (
            <p>ยังไม่มีรายชื่อที่บันทึกไว้</p>
          )}
          <button className="min-h-11" onClick={() => setSelected(null)}>
            ปิดรายละเอียด
          </button>
        </section>
      )}
      <section data-farm-panel className="space-y-3">
        <h2 className="font-bold">ส่งกำลังใจให้ฟาร์ม</h2>
        <p>
          {sent
            ? "ส่งให้เพื่อนคนนี้วันนี้แล้ว"
            : `ส่งได้อีก ${remaining} ครั้งวันนี้`}{" "}
          · 1 ครั้งต่อเพื่อนต่อวัน รวมไม่เกิน 10 ครั้งตามเวลาไทย
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FARM_STICKERS.map((s) => (
            <button
              key={s.id}
              className="min-h-14 rounded bg-white/10 p-2"
              disabled={
                busy ||
                sent ||
                remaining === 0 ||
                (!!pending && pending.sticker !== s.id)
              }
              onClick={() => sticker(s.id)}
            >
              {s.icon} {s.label}
              {pending?.sticker === s.id ? " · ลองส่งเดิม" : ""}
            </button>
          ))}
        </div>
        {message && <p role="status">{message}</p>}
      </section>
      <details className="rounded-xl border border-white/20 p-4">
        <summary className="min-h-11 cursor-pointer">
          แบบสถานที่สำหรับวางแผนฟาร์มของเรา
        </summary>
        <ul className="space-y-3">
          {farm.catalogue.map((c) => (
            <li key={c.id}>
              {labels[c.definition.place]}
              {c.definition.targetLevel
                ? " ระดับ " + c.definition.targetLevel
                : ""}{" "}
              · {c.definition.price} เหรียญ · โรงเรียนระดับ{" "}
              {c.definition.schoolLevel} · หัวหน้า Qmon ระยะ{" "}
              {c.definition.leaderStage} · สูงสุด {c.definition.limit} โครงการ
            </li>
          ))}
        </ul>
        <Link
          className="inline-flex min-h-11 items-center underline"
          href="/collection/school/learn"
        >
          ไปสมุดแบบสร้างของเรา →
        </Link>
      </details>
    </main>
  );
}
