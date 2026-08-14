"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SegmentedTabs from "@/components/SegmentedTabs";
import UndoRejectToast from "@/components/social/UndoRejectToast";
import Toast from "@/components/social/Toast";
import { PetPreviewImage } from "@/components/social/AddFriendView";
import { respondFriendRequest, cancelFriendRequest } from "@/app/social/actions";
import type { FriendRequestItem } from "@/lib/friendRequests";

const TABS = [
  { key: "received", label: "ได้รับ" },
  { key: "sent", label: "ส่งแล้ว" },
];

const UNDO_DELAY_MS = 5000;

export default function FriendRequestsView({
  received,
  sent,
}: {
  received: FriendRequestItem[];
  sent: FriendRequestItem[];
}) {
  const [activeTab, setActiveTab] = useState("received");
  const [receivedList, setReceivedList] = useState(received);
  const [sentList, setSentList] = useState(sent);
  const [pendingReject, setPendingReject] = useState<{ item: FriendRequestItem; index: number } | null>(null);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function handleAccept(item: FriendRequestItem) {
    if (isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await respondFriendRequest(item.requestId, "accept");
        setReceivedList((prev) => prev.filter((r) => r.requestId !== item.requestId));
        setToastMessage(`เพิ่ม ${item.username} เป็นเพื่อนแล้ว`);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "ตอบรับคำขอไม่สำเร็จ");
      }
    });
  }

  // Undo 5 วิ — optimistic-delay ที่ client ล้วนๆ: เอาการ์ดออกทันที ตั้ง timer ไว้ค่อยยิง RPC จริง
  // ถ้ากด Undo ก่อนครบเวลา แค่ clearTimeout + เอาการ์ดกลับมา ไม่มี RPC ถูกยิงเลยในเคส Undo
  function handleReject(item: FriendRequestItem) {
    if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    const index = receivedList.findIndex((r) => r.requestId === item.requestId);
    setReceivedList((prev) => prev.filter((r) => r.requestId !== item.requestId));
    setPendingReject({ item, index });
    rejectTimerRef.current = setTimeout(() => {
      respondFriendRequest(item.requestId, "reject").catch(() => {
        // เงียบไว้พอ — การ์ดออกจากลิสต์ไปแล้วฝั่ง UI, ถ้า RPC พังจริงๆ คำขอจะยัง pending อยู่ใน DB
        // เจอใหม่ตอน list โหลดรอบถัดไป ไม่ critical พอจะโชว์ error แทรกตอนผู้เล่นทำอย่างอื่นต่อแล้ว
      });
      setPendingReject(null);
      rejectTimerRef.current = null;
    }, UNDO_DELAY_MS);
  }

  function handleUndoReject() {
    if (rejectTimerRef.current) {
      clearTimeout(rejectTimerRef.current);
      rejectTimerRef.current = null;
    }
    if (pendingReject) {
      setReceivedList((prev) => {
        const next = [...prev];
        next.splice(pendingReject.index, 0, pendingReject.item);
        return next;
      });
    }
    setPendingReject(null);
  }

  function handleCancel(item: FriendRequestItem) {
    if (isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await cancelFriendRequest(item.requestId);
        setSentList((prev) => prev.filter((r) => r.requestId !== item.requestId));
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "ยกเลิกคำขอไม่สำเร็จ");
      }
    });
  }

  const list = activeTab === "received" ? receivedList : sentList;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/social" className="flex items-center gap-1 text-sm text-text3 transition hover:text-gold-hi">
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>

      <SegmentedTabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab} />

      {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          {activeTab === "received" ? "ยังไม่มีคำขอที่ได้รับ" : "ยังไม่มีคำขอที่ส่งไป"}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((item) => (
            <div
              key={item.requestId}
              className="flex items-center gap-3 rounded-2xl border border-gold-dim bg-card p-3"
            >
              <Link
                href={`/social/profile/${item.otherUserId}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <PetPreviewImage pet={item.pet} />
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-text">{item.username}</p>
              </Link>
              {activeTab === "received" ? (
                <div className="flex flex-none gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleReject(item)}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-text3 transition active:scale-95 disabled:opacity-50"
                  >
                    ปฏิเสธ
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAccept(item)}
                    className="rounded-xl border border-gold bg-amber px-3 py-2 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
                  >
                    รับ
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleCancel(item)}
                  className="flex-none rounded-xl px-3 py-2 text-sm font-medium text-text3 transition active:scale-95 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingReject && (
        <UndoRejectToast message={`ปฏิเสธ ${pendingReject.item.username} แล้ว`} onUndo={handleUndoReject} />
      )}
      {toastMessage && <Toast message={toastMessage} onDone={() => setToastMessage(null)} />}
    </div>
  );
}
