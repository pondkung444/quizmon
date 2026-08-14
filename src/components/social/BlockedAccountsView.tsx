"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { resolvePetDisplay } from "@/components/social/petSummary";
import { unblockUser } from "@/app/social/actions";
import type { BlockedAccountItem } from "@/lib/friends";

export default function BlockedAccountsView({ blocked }: { blocked: BlockedAccountItem[] }) {
  const [list, setList] = useState(blocked);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleUnblock(item: BlockedAccountItem) {
    if (isPending) return;
    setErrorMessage(null);
    setPendingId(item.blockedUserId);
    startTransition(async () => {
      try {
        await unblockUser(item.blockedUserId);
        setList((prev) => prev.filter((b) => b.blockedUserId !== item.blockedUserId));
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "เลิกบล็อกไม่สำเร็จ");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/social?tab=profile"
        className="flex items-center gap-1 text-sm text-text3 transition hover:text-gold-hi"
      >
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>
      <h1 className="text-lg font-bold text-gold-hi">บัญชีที่บล็อก</h1>

      {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          ยังไม่มีบัญชีที่บล็อกไว้
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((item) => {
            const { imagePath, speciesName } = item.pet
              ? resolvePetDisplay(item.pet)
              : { imagePath: null, speciesName: "" };
            return (
              <div
                key={item.blockedUserId}
                className="flex items-center gap-3 rounded-2xl border border-gold-dim bg-card p-3"
              >
                <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full border border-gold-dim bg-track">
                  {imagePath && (
                    <Image src={imagePath} alt={speciesName} width={40} height={40} className="h-full w-full object-contain" />
                  )}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-text">{item.username}</p>
                <button
                  type="button"
                  disabled={isPending && pendingId === item.blockedUserId}
                  onClick={() => handleUnblock(item)}
                  className="flex-none rounded-xl border border-gold-dim px-3 py-2 text-sm font-bold text-text3 transition active:scale-95 disabled:opacity-50"
                >
                  เลิกบล็อก
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
