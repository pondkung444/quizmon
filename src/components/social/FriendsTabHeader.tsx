"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, Inbox, Users, UsersRound, Copy, Check, HeartHandshake } from "lucide-react";
import FriendListSection from "@/components/social/FriendListSection";
import type { FriendListItem } from "@/lib/friends";

export type FriendsHeaderData = {
  friendCount: number;
  receivedRequestCount: number;
  myFriendCode: string;
  friends: FriendListItem[];
  unreadEncouragementCount: number;
};

function formatFriendCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

// Empty state เฉพาะตอนเพื่อน=0 — มีเพื่อนแล้วห้ามโชว์อันนี้ (ดูขัดกับความจริง) ใช้ placeholder
// สั้นๆ แทน ปุ่มคัดลอก Friend Code ใช้ navigator.clipboard เหมือนที่ S06 ทำไว้แล้ว
function EmptyFriendsState({ myFriendCode }: { myFriendCode: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(myFriendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // เงียบไว้พอ — ปุ่มเดียวกันที่ S06 ก็ไม่มี error state ซ้อน (permission เดี้ยงเจอเฉพาะตอนเทสต์
      // ผ่าน automation เท่านั้น ผู้เล่นจริงกดจากมือถือได้ trusted gesture ปกติ)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold-dim bg-card p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber/15">
        <UsersRound className="h-8 w-8 text-amber" />
      </div>
      <div>
        <p className="text-base font-bold text-gold-hi">ยังไม่มีเพื่อนเลย</p>
        <p className="mt-1 text-sm text-text3">
          เพิ่มเพื่อนเพื่อดูอันดับ ส่งกำลังใจ
          <br />
          และแข่งกันฝึกฝนไปด้วยกัน
        </p>
      </div>
      <Link
        href="/social/add-friend"
        className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-gold bg-amber text-sm font-bold text-track transition active:scale-95"
      >
        เพิ่มเพื่อนคนแรก
      </Link>
      <div className="flex w-full items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-text3">หรือแชร์รหัสของฉัน</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex w-full items-center justify-between rounded-xl border border-gold-dim bg-track px-4 py-2.5">
        <span className="text-sm font-bold tracking-widest text-gold-hi">{formatFriendCode(myFriendCode)}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-text3 transition active:scale-95"
        >
          {copied ? <Check className="h-4 w-4 text-amber" /> : <Copy className="h-4 w-4" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
    </div>
  );
}

// เฟส 3 ทำแค่ "ส่วนหัว" ของ S02 (จำนวนเพื่อน + ทางเข้า S06/S07) — รายชื่อเพื่อนแบบเต็มเป็นเฟส 4
// (มาพร้อมปุ่มลบเพื่อน/บล็อกที่ต้องมาคู่กัน) ห้ามสร้าง friend list rows จริงตรงนี้ก่อน
export default function FriendsTabHeader({ data }: { data: FriendsHeaderData }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-gold-dim bg-card p-4">
        <div className="flex items-center gap-2 rounded-full border border-gold-dim bg-track px-4 py-2">
          <Users className="h-4 w-4 text-amber" />
          <span className="text-sm font-bold text-text">{data.friendCount} เพื่อน</span>
        </div>
        <Link
          href="/social/add-friend"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95"
        >
          <UserPlus className="h-4 w-4" />
          เพิ่มเพื่อน
        </Link>
      </div>

      <Link
        href="/social/requests"
        className="flex min-h-11 items-center gap-3 rounded-2xl border border-gold-dim bg-card p-4 transition active:scale-95"
      >
        <Inbox className="h-5 w-5 flex-none text-amber" />
        <span className="flex-1 text-sm font-bold text-text">คำขอเป็นเพื่อน</span>
        {data.receivedRequestCount > 0 && (
          <span className="flex h-6 min-w-6 flex-none items-center justify-center rounded-full bg-red px-1.5 text-xs font-bold text-text">
            {data.receivedRequestCount}
          </span>
        )}
      </Link>

      <Link
        href="/social/encouragements"
        className="flex min-h-11 items-center gap-3 rounded-2xl border border-gold-dim bg-card p-4 transition active:scale-95"
      >
        <HeartHandshake className="h-5 w-5 flex-none text-amber" />
        <span className="flex-1 text-sm font-bold text-text">กำลังใจถึงฉัน</span>
        {data.unreadEncouragementCount > 0 && (
          <span className="flex h-6 min-w-6 flex-none items-center justify-center rounded-full bg-red px-1.5 text-xs font-bold text-text">
            {data.unreadEncouragementCount}
          </span>
        )}
      </Link>

      {data.friendCount === 0 ? (
        <EmptyFriendsState myFriendCode={data.myFriendCode} />
      ) : (
        <FriendListSection friends={data.friends} />
      )}
    </div>
  );
}
