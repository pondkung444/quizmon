"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Copy, Check, ArrowLeft } from "lucide-react";
import {
  searchFriendCode,
  searchFriendName,
  sendFriendRequest,
  type SearchFriendCodeResult,
} from "@/app/social/actions";
import { normalizeFriendCode, formatFriendCode } from "@/lib/friendCode";
import { resolvePetDisplay, type PetPreview } from "@/components/social/petSummary";
import { FRIEND_STATUS_MESSAGE, FRIEND_ACTIONABLE_STATUSES } from "@/components/social/friendActionStatus";
import Toast from "@/components/social/Toast";

export default function AddFriendView({ myFriendCode, invitationCode = "" }: { myFriendCode: string; invitationCode?: string }) {
  const [copied, setCopied] = useState(false);
  const [searchMode, setSearchMode] = useState<"name" | "code">(invitationCode ? "code" : "name");
  const [candidates, setCandidates] = useState<SearchFriendCodeResult[]>([]);
  const [input, setInput] = useState(invitationCode);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<SearchFriendCodeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const normalized = normalizeFriendCode(input);
  const canSearch = (searchMode === "code" ? normalized.length === 8 : input.trim().length >= 2) && !isSearching && !isSending;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(myFriendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMessage("คัดลอกไม่สำเร็จ ลองกดค้างแล้วคัดลอกเองนะ");
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/social/add-friend?code=${encodeURIComponent(myFriendCode)}`;
    try {
      if (navigator.share) await navigator.share({ title: "มาเป็นเพื่อนใน Qmon", url });
      else { await navigator.clipboard.writeText(url); setToastMessage("คัดลอกลิงก์เพิ่มเพื่อนแล้ว ส่งให้เพื่อนได้เลย"); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setErrorMessage("แชร์ไม่สำเร็จ ลองคัดลอกรหัสแทนนะ");
    }
  }

  async function handleSearch() {
    if (!canSearch) return;
    setIsSearching(true);
    setErrorMessage(null);
    setResult(null);
    setCandidates([]);
    try {
      if (searchMode === "name") {
        const matches = await searchFriendName(input);
        setCandidates(matches);
        if (matches.length === 1) setResult(matches[0]);
        if (matches.length === 0) setResult({ found: false });
      } else {
        setResult(await searchFriendCode(normalized));
      }
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

      <div className="order-last rounded-2xl border border-gold-dim bg-card p-4 text-center">
        <button type="button" disabled={!myFriendCode} onClick={handleShare} className="mb-3 min-h-11 w-full rounded-xl bg-amber px-4 text-sm font-bold text-track">แชร์ลิงก์ให้เพื่อน</button>
        <p className="text-xs text-text3">รหัสเพื่อนของฉัน · ใช้เป็นทางสำรอง</p>
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
        <h1 className="text-lg font-bold text-gold-hi">หาเพื่อนของฉัน</h1>
        <div className="flex gap-2">
          {(["name", "code"] as const).map(mode => <button key={mode} type="button" aria-pressed={searchMode === mode} disabled={isSearching || isSending} onClick={() => { setSearchMode(mode); setInput(""); setResult(null); setCandidates([]); }} className="min-h-11 flex-1 rounded-xl border border-gold-dim px-3 text-sm">{mode === "name" ? "ชื่อเล่น" : "รหัสเพื่อน"}</button>)}
        </div>
        <p className="text-xs text-text3">{searchMode === "name" ? "พิมพ์ชื่อเล่นที่เพื่อนใช้ในเกมให้ครบ ชื่อซ้ำได้ ลองดู Qmon ให้ตรงคน" : "กรอกรหัส 8 ตัวจากเพื่อน"}</p>
        <form onSubmit={e => { e.preventDefault(); void handleSearch(); }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setResult(null); setCandidates([]); }}
            disabled={isSearching || isSending}
            aria-label={searchMode === "name" ? "ชื่อเล่นเพื่อน" : "รหัสเพื่อน"}
            maxLength={searchMode === "name" ? 40 : 20}
            placeholder={searchMode === "name" ? "ชื่อเล่นเพื่อนในเกม" : "รหัสเพื่อน 8 ตัว"}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-gold-dim bg-track px-3 text-base text-text placeholder:text-text3"
          />
          <button
            type="submit"
            disabled={!canSearch}
            className="min-h-11 flex-none rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
          >
            {isSearching ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
        {errorMessage && <p className="text-sm text-red">{errorMessage}</p>}
      </div>

      {candidates.length > 1 && <div className="space-y-2" aria-label="ผู้เล่นชื่อเดียวกัน">
        <p className="text-xs text-text3">พบ {candidates.length} คน เลือกให้ตรงกับเพื่อน ถ้าไม่แน่ใจใช้รหัสเพื่อน</p>
        {candidates.map(candidate => candidate.found && <button type="button" key={candidate.targetUserId} disabled={isSending} onClick={() => setResult(candidate)} className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border p-3 text-left">
          <PetPreviewImage pet={candidate.pet} /><span className="min-w-0 break-words">{candidate.username}<span className="block text-xs text-text3">{candidate.pet?.nickname ?? "ยังไม่ได้ตั้งชื่อ Qmon"}</span></span><span className="ml-auto text-xs text-text3">เลือกคนนี้</span>
        </button>)}
      </div>}

      {result && (
        <div className="rounded-2xl border border-gold-dim bg-card p-4">
          {!result.found ? (
            <p className="text-center text-sm text-text3">ไม่พบเพื่อน ลองตรวจชื่อเล่นหรือใช้รหัสเพื่อนแทน</p>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href={`/social/profile/${result.targetUserId}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <PetPreviewImage pet={result.pet} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text">{result.username}</p>
                  {FRIEND_STATUS_MESSAGE[result.relationshipStatus] && (
                    <p className="text-xs text-text3">{FRIEND_STATUS_MESSAGE[result.relationshipStatus]}</p>
                  )}
                </div>
              </Link>
              {FRIEND_ACTIONABLE_STATUSES.includes(result.relationshipStatus) && (
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
