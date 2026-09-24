"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { hatchEgg } from "@/app/eggs/actions";
import { track } from "@/lib/analytics";
import { uxFunnelProps } from "@/lib/analyticsContract";
import { useSfx } from "@/lib/audio/useSfx";
import HatchNamingModal from "@/components/HatchNamingModal";
import { requestPushPermissionWithContext } from "@/lib/push/pushClient";
import { X } from "lucide-react";
import { EGG_TIER_ORDER, eggTierLabel, eggTierRank } from "@/lib/eggTier";


export type EggListItem = {
  id: string;
  source: string;
  obtainedAt: string;
  eggTypeId: string;
  nameTh: string;
  tier: string;
  description: string | null;
  imagePath: string | null;
};

export default function EggsClient({
  eggs,
  hasActivePet,
}: {
  eggs: EggListItem[];
  hasActivePet: boolean;
}) {
  const router = useRouter();
  const sfx = useSfx();
  const [isPending, startTransition] = useTransition();
  const [hatchingId, setHatchingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [namingEggId, setNamingEggId] = useState<string | null>(null);
  const trackedStarterEggRef = useRef(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string>("all");

  useEffect(() => {
    const starterEgg = eggs.find((egg) => egg.source === "starter");
    if (!starterEgg || trackedStarterEggRef.current) return;
    trackedStarterEggRef.current = true;
    track("starter_egg_viewed", uxFunnelProps("no_pet", { activity: "hatch" }));
  }, [eggs]);

  useEffect(() => {
    if (!openGroupId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenGroupId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openGroupId]);

  function openNamingModal(eggId: string) {
    if (isPending) return;
    setErrorMessage(null);
    setNamingEggId(eggId);
  }

  function handleConfirmHatch(nickname: string) {
    const eggId = namingEggId;
    if (!eggId || isPending) return;
    setErrorMessage(null);
    setHatchingId(eggId);
    startTransition(async () => {
      try {
        await hatchEgg(eggId, nickname);
        const egg = eggs.find((e) => e.id === eggId);
        if (egg) {
          track("egg_selected", { egg_type_id: egg.eggTypeId });
          track("pet_hatched", uxFunnelProps("active_pet", { activity: "hatch", source: egg.source }));
        }
        // common = เสียงได้ของปกติ · tier อื่น (rare/legendary/epic) = fanfare
        sfx(egg && egg.tier !== "common" ? "reward_fanfare" : "reward_normal");
        // ขอ push permission แบบมี context (หลัง hatch สำเร็จ ไม่ใช่ทันทีตอนเปิดแอป)
        // no-op ถ้าเคย grant/denied ไปแล้ว จะไม่โผล่ prompt ซ้ำ — ไม่ block การ navigate
        requestPushPermissionWithContext();
        router.push("/pet");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "ฟักไข่ไม่สำเร็จ ลองใหม่อีกครั้งนะ");
        setHatchingId(null);
      }
    });
  }

  const namingEgg = namingEggId ? eggs.find((e) => e.id === namingEggId) ?? null : null;

  // รวมไข่ชนิดเดียวกันเป็นกองเดียว (จัดใหม่ 2026-09 — เดิมโชว์ทีละฟองซ้ำกันยาวเป็นแถว) เรียงหายากสุดก่อน
  // ในกองเรียงฟองที่ได้มาก่อนสุดไว้หน้า (eggs มาจาก page.tsx เรียง obtained_at น้อย→มาก อยู่แล้ว) —
  // กด "ฟักไข่นี้" จะฟักฟองแรกของกอง
  const groups: EggGroup[] = [];
  for (const egg of eggs) {
    const g = groups.find((x) => x.eggTypeId === egg.eggTypeId);
    if (g) g.eggs.push(egg);
    else groups.push({ eggTypeId: egg.eggTypeId, nameTh: egg.nameTh, tier: egg.tier, description: egg.description, imagePath: egg.imagePath, eggs: [egg] });
  }
  groups.sort((a, b) => eggTierRank(a.tier) - eggTierRank(b.tier) || a.nameTh.localeCompare(b.nameTh, "th"));

  const tiersPresent = EGG_TIER_ORDER.filter((t) => groups.some((g) => g.tier === t));
  const visibleGroups = tierFilter === "all" ? groups : groups.filter((g) => g.tier === tierFilter);
  const openGroup = openGroupId ? groups.find((g) => g.eggTypeId === openGroupId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {hasActivePet && (
        <p className="rounded-xl border border-amber-dim bg-amber/10 p-3 text-center text-sm text-amber">
          กำลังเลี้ยงอยู่ 1 ตัว เก็บเข้าฟาร์มก่อนถึงจะฟักตัวใหม่ได้ —{" "}
          <a href="/pet" className="font-bold underline">
            ไปหน้าเลี้ยง Qmon
          </a>
        </p>
      )}

      {errorMessage && (
        <p className="rounded-xl border border-red bg-red/10 p-3 text-center text-sm text-red">
          {errorMessage}
        </p>
      )}

      {eggs.length === 0 ? (
        <p className="rounded-xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          ยังไม่มีไข่ในคลัง
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-text">
              มีไข่ {eggs.length} ฟอง · {groups.length} ชนิด
            </p>
            {tiersPresent.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามความหายาก">
                {(["all", ...tiersPresent] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tierFilter === t}
                    onClick={() => setTierFilter(t)}
                    className={`min-h-8 rounded-full px-3 text-xs font-bold transition active:scale-95 ${
                      tierFilter === t ? "bg-amber text-on-amber" : "border border-border bg-card text-text2"
                    }`}
                  >
                    {t === "all" ? "ทั้งหมด" : eggTierLabel(t)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3">
            {visibleGroups.map((g, i) => (
              <button
                key={g.eggTypeId}
                type="button"
                onClick={() => {
                  sfx("tap");
                  setOpenGroupId(g.eggTypeId);
                }}
                className={`egg-tier-${g.tier} relative flex min-w-0 flex-col items-center gap-1 rounded-2xl border-2 bg-card px-2 pb-3 pt-4 text-center shadow-sm transition active:scale-95`}
              >
                {g.eggs.length > 1 && (
                  <span className="egg-tier-badge absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold">
                    ×{g.eggs.length}
                  </span>
                )}
                <span className="animate-card-bob" style={{ animationDelay: `${(i % 4) * 0.35}s` }}>
                  {g.imagePath ? (
                    <Image src={g.imagePath} alt="" width={72} height={72} className="h-[72px] w-[72px] object-contain drop-shadow-md" />
                  ) : (
                    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-track text-xs text-text3">?</span>
                  )}
                </span>
                <span className="mt-1 block max-w-full truncate text-sm font-bold text-text">{g.nameTh}</span>
                <span className="egg-tier-badge rounded-full px-2 py-0.5 text-[10px] font-bold">{eggTierLabel(g.tier)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {openGroup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setOpenGroupId(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="egg-detail-title"
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-md rounded-t-3xl border-t border-gold-dim bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center"
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpenGroupId(null)}
                aria-label="ปิด"
                className="flex h-9 w-9 items-center justify-center rounded-full text-text3 active:scale-95"
              >
                <X size={18} />
              </button>
            </div>
            <div className={`egg-tier-${openGroup.tier} mx-auto flex h-36 w-36 items-center justify-center rounded-full border-2 bg-track`}>
              {openGroup.imagePath && (
                <Image src={openGroup.imagePath} alt={openGroup.nameTh} width={112} height={112} className="animate-egg-wobble h-28 w-28 object-contain drop-shadow-lg" />
              )}
            </div>
            <h2 id="egg-detail-title" className="mt-3 text-xl font-bold text-text">{openGroup.nameTh}</h2>
            <div className={`egg-tier-${openGroup.tier} mt-1 flex items-center justify-center gap-2`}>
              <span className="egg-tier-badge rounded-full px-2.5 py-0.5 text-xs font-bold">{eggTierLabel(openGroup.tier)}</span>
              <span className="text-xs text-text3">มี {openGroup.eggs.length} ฟอง</span>
            </div>
            {openGroup.description && <p className="mt-3 text-sm leading-relaxed text-text2">{openGroup.description}</p>}

            {hasActivePet ? (
              <div className="mt-5 flex flex-col gap-2">
                <p className="text-xs text-text3">เก็บ Qmon ที่เลี้ยงอยู่เข้าฟาร์มก่อน ถึงจะฟักไข่ใบใหม่ได้</p>
                <a href="/pet" className="rounded-2xl border-2 border-border py-3 text-base font-bold text-text2 active:scale-95">
                  ไปหน้าเลี้ยง Qmon
                </a>
              </div>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const eggId = openGroup.eggs[0].id;
                  setOpenGroupId(null);
                  openNamingModal(eggId);
                }}
                className="mt-5 w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-on-amber shadow-lg transition active:scale-95 disabled:opacity-50"
              >
                {isPending && openGroup.eggs.some((e) => e.id === hatchingId) ? "กำลังฟัก..." : "ฟักไข่นี้"}
              </button>
            )}
          </div>
        </div>
      )}

      {namingEgg && (
        <HatchNamingModal
          eggNameTh={namingEgg.nameTh}
          eggImagePath={namingEgg.imagePath}
          isPending={isPending}
          errorMessage={errorMessage}
          onConfirm={handleConfirmHatch}
        />
      )}
    </div>
  );
}

type EggGroup = {
  eggTypeId: string;
  nameTh: string;
  tier: string;
  description: string | null;
  imagePath: string | null;
  eggs: EggListItem[];
};
