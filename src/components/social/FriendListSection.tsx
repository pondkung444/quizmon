"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { resolvePetDisplay } from "@/components/social/petSummary";
import type { FriendListItem } from "@/lib/friends";

function formatFriendsSince(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

type SortKey = "recent" | "name";

// ค่าเริ่มต้น "เพิ่มล่าสุด" ไปก่อน — สเปกจริงต้องการ "ผู้มีปฏิสัมพันธ์ใหม่ก่อน" เป็นดีฟอลต์ แต่ข้อมูล
// ปฏิสัมพันธ์ยังไม่มีจนกว่าระบบถูกใจ/กำลังใจ (เฟส 5/7) จะมาถึง — ต้องกลับมาแก้ default ตอนนั้น
export default function FriendListSection({ friends }: { friends: FriendListItem[] }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? friends.filter((f) => f.username.toLowerCase().includes(q)) : friends;
    return [...base].sort((a, b) =>
      sortBy === "name"
        ? a.username.localeCompare(b.username, "th")
        : new Date(b.friendsSince).getTime() - new Date(a.friendsSince).getTime()
    );
  }, [friends, query, sortBy]);

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาเพื่อน"
        className="min-h-11 rounded-xl border border-gold-dim bg-track px-3 text-sm text-text placeholder:text-text3"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSortBy("recent")}
          className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${
            sortBy === "recent" ? "bg-amber text-track" : "border border-gold-dim text-text3"
          }`}
        >
          เพิ่มล่าสุด
        </button>
        <button
          type="button"
          onClick={() => setSortBy("name")}
          className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${
            sortBy === "name" ? "bg-amber text-track" : "border border-gold-dim text-text3"
          }`}
        >
          ชื่อ
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          ไม่พบเพื่อนที่ค้นหา
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((friend) => {
            const { imagePath, speciesName } = friend.pet
              ? resolvePetDisplay(friend.pet)
              : { imagePath: null, speciesName: "" };
            return (
              <Link
                key={friend.friendUserId}
                href={`/social/friend/${friend.friendUserId}`}
                className="flex items-center gap-3 rounded-2xl border border-gold-dim bg-card p-3 transition active:scale-95"
              >
                <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full border border-gold-dim bg-track">
                  {imagePath && (
                    <Image src={imagePath} alt={speciesName} width={40} height={40} className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text">{friend.username}</p>
                  <p className="truncate text-xs text-text3">
                    {[friend.school, friend.gradeLevel].filter(Boolean).join(" · ") || "ไม่ระบุโรงเรียน"}
                  </p>
                  <p className="truncate text-[11px] text-text3">เพื่อนเมื่อ {formatFriendsSince(friend.friendsSince)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
