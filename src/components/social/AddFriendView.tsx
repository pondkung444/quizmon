"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Copy, Check, ArrowLeft } from "lucide-react";
import {
  searchFriendCode,
  sendFriendRequest,
  type SearchFriendCodeResult,
  type RelationshipStatus,
} from "@/app/social/actions";
import { normalizeFriendCode } from "@/lib/friendCode";
import { resolvePetDisplay, type PetPreview } from "@/components/social/petSummary";
import Toast from "@/components/social/Toast";

function formatFriendCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

const STATUS_MESSAGE: Record<RelationshipStatus, string | null> = {
  self: "นี่คือ Friend Code ของคุณเอง",
  friends: "เป็นเพื่อนกันอยู่แล้ว",
  pending_sent: "ส่งคำขอแล้ว รอเขาตอบรับ",
  pending_received: "เขาส่งคำขอมาหาคุณอยู่แล้ว — กดเพิ่มเพื่อนเพื่อตอบรับได้เลย",
  friend_list_full: "รายชื่อเพื่อนเต็มแล้ว (ฝั่งใดฝั่งหนึ่งครบ 100 คน)",
  available: null,
};

// ปุ่ม "เพิ่มเพื่อน" ใช้ได้ทั้งตอน available และ pending_received (เขาส่งคำขอมาหาเราค้างอยู่ก่อน) —
// send_friend_request จะ auto-accept ให้เองทันทีถ้าเจอคำขอย้อนกลับ ไม่ต้องมีปุ่ม "ตอบรับ" แยกในหน้านี้
const ACTIONABLE_STATUSES: RelationshipStatus[] = ["available", "pending_received"];

export default function AddFriendView({ myFriendCode }: { myFriendCode: string }) {
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<SearchFriendCodeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const normalized = normalizeFriendCode(input);
  const canSearch = normalized.length === 8 && !isSearching;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(myFriendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMessage("คัดลอกไม่สำเร็จ ลองกดค้างแล้วคัดลอกเองนะ");
    }
  }

  async function handleSearch() {
    if (!canSearch) return;
    setIsSearching(true);
    setErrorMessage(null);
    setResult(null);
    try {
      const res = await searchFriendCode(normalized);
      setResult(res);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ค้นหาไม่สำเร็จ");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSend() {
    if (!result || !result.found || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    try {
      const res = await sendFriendRequest(result.targetUserId);
      setResult({ ...result, relationshipStatus: res.autoAccepted ? "friends" : "pending_sent" });
      setToastMessage(res.autoAccepted ? "เพิ่มเพื่อนสำเร็จ!" : "ส่งคำขอเป็นเพื่อนแล้ว");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/social" className="flex items-center gap-1 text-sm text-text3 transition hover:text-gold-hi">
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>

      <div className="rounded-2xl border border-gold-dim bg-card p-6 text-center">
        <p className="text-xs text-text3">Friend Code ของฉัน</p>
        <p className="mt-1 text-2xl font-bold tracking-widest text-gold-hi">{formatFriendCode(myFriendCode)}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-gold-dim px-4 text-sm font-bold text-text3 transition active:scale-95"
        >
          {copied ? <Check className="h-4 w-4 text-amber" /> : <Copy className="h-4 w-4" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-gold-hi">เพิ่มเพื่อนด้วย Friend Code</p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="กรอก Friend Code เพื่อน"
            className="min-h-11 flex-1 rounded-xl border border-gold-dim bg-track px-3 text-sm text-text placeholder:text-text3"
          />
          <button
            type="button"
            disabled={!canSearch}
            onClick={handleSearch}
            className="min-h-11 flex-none rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
          >
            {isSearching ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </div>
        {errorMessage && <p className="text-sm text-red">{errorMessage}</p>}
      </div>

      {result && (
        <div className="rounded-2xl border border-gold-dim bg-card p-4">
          {!result.found ? (
            <p className="text-center text-sm text-text3">ไม่พบผู้เล่นที่ใช้ Friend Code นี้</p>
          ) : (
            <div className="flex items-center gap-3">
              <PetPreviewImage pet={result.pet} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-text">{result.username}</p>
                {STATUS_MESSAGE[result.relationshipStatus] && (
                  <p className="text-xs text-text3">{STATUS_MESSAGE[result.relationshipStatus]}</p>
                )}
              </div>
              {ACTIONABLE_STATUSES.includes(result.relationshipStatus) && (
                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleSend}
                  className="flex-none rounded-xl border border-gold bg-amber px-4 py-2.5 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
                >
                  {isSending ? "กำลังส่ง..." : "เพิ่มเพื่อน"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {toastMessage && <Toast message={toastMessage} onDone={() => setToastMessage(null)} />}
    </div>
  );
}

export function PetPreviewImage({ pet }: { pet: PetPreview }) {
  if (!pet) {
    return <div className="h-12 w-12 flex-none rounded-full border border-gold-dim bg-track" />;
  }
  const { imagePath, speciesName } = resolvePetDisplay(pet);
  return (
    <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full border border-gold-dim bg-track">
      {imagePath && (
        <Image src={imagePath} alt={speciesName} width={40} height={40} className="h-full w-full object-contain" />
      )}
    </div>
  );
}
