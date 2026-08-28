"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { resolvePetDisplay } from "@/components/social/petSummary";
import SendEncouragementSheet from "@/components/social/SendEncouragementSheet";
import Toast from "@/components/social/Toast";
import { ENCOURAGEMENT_MESSAGES } from "@/lib/encouragementMessages";
import type { ReceivedEncouragement } from "@/lib/encouragements";

// label วันที่เฉยๆ ไม่มีเวลาเป็นนาที (§11.7) — sent_date เป็น date (ไม่มีเวลา) อยู่แล้วตั้งแต่ RPC
function formatDateLabel(sentDate: string): string {
  return new Date(sentDate + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// S08 (§8) — RPC list_encouragements_received มี side effect mark ทุกแถวยังไม่อ่านเป็นอ่านแล้ว
// ทันทีที่เรียก (ฝั่ง server ตอน page.tsx fetch) จุดสีส้มบน BottomNav หายตั้งแต่โหลดหน้านี้เสร็จ
export default function EncouragementsView({ received }: { received: ReceivedEncouragement[] }) {
  const [sentBackIds, setSentBackIds] = useState<Set<string>>(
    () => new Set(received.filter((r) => r.alreadySentBackToday).map((r) => r.senderId))
  );
  const [sheetRecipientId, setSheetRecipientId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // received เรียงจาก RPC มาแล้ว (sent_date desc, id desc) — group ตามลำดับเดิม ไม่ sort ซ้ำ
  const groups = useMemo(() => {
    const map = new Map<string, ReceivedEncouragement[]>();
    for (const item of received) {
      const list = map.get(item.sentDate) ?? [];
      list.push(item);
      map.set(item.sentDate, list);
    }
    return [...map.entries()];
  }, [received]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/social?tab=friends" className="flex items-center gap-1 text-sm text-text3 transition hover:text-gold-hi">
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>
      <h1 className="text-lg font-bold text-gold-hi">กำลังใจถึงฉัน</h1>

      {received.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold-dim bg-card p-8 text-center">
          <p className="text-sm text-text3">กำลังใจจากเพื่อนจะมาปรากฏตรงนี้</p>
          <Link
            href="/social?tab=friends"
            className="flex min-h-11 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95"
          >
            ดูรายชื่อเพื่อน
          </Link>
        </div>
      ) : (
        groups.map(([date, items]) => (
          <section key={date} className="flex flex-col gap-2">
            <p className="text-xs font-bold text-gold-hi">{formatDateLabel(date)}</p>
            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const { imagePath, speciesName } = item.pet
                  ? resolvePetDisplay(item.pet)
                  : { imagePath: null, speciesName: "" };
                const sentBack = sentBackIds.has(item.senderId);
                return (
                  <div
                    key={item.encouragementId}
                    className="flex items-center gap-3 rounded-2xl border border-gold-dim bg-card p-3"
                  >
                    <Link
                      href={`/social/friend/${item.senderId}`}
                      prefetch={false}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full border border-gold-dim bg-track">
                        {imagePath && (
                          <Image src={imagePath} alt={speciesName} width={40} height={40} className="h-full w-full object-contain" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-text">{item.senderUsername}</p>
                        <p className="truncate text-xs text-text3">{ENCOURAGEMENT_MESSAGES[item.messageKey]}</p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      disabled={sentBack}
                      onClick={() => setSheetRecipientId(item.senderId)}
                      className="flex-none rounded-xl border border-gold-dim px-3 py-2 text-xs font-bold text-text3 transition active:scale-95 disabled:opacity-50"
                    >
                      {sentBack ? "ส่งแล้ววันนี้" : "ส่งกำลังใจกลับ"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {sheetRecipientId && (
        <SendEncouragementSheet
          recipientId={sheetRecipientId}
          onSent={() => {
            setSentBackIds((prev) => new Set(prev).add(sheetRecipientId));
            setToastMessage("ส่งกำลังใจแล้ว!");
            setSheetRecipientId(null);
          }}
          onClose={() => setSheetRecipientId(null)}
        />
      )}
      {toastMessage && <Toast message={toastMessage} onDone={() => setToastMessage(null)} />}
    </div>
  );
}
