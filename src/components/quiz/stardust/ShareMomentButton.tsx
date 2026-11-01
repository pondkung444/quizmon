"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { track } from "@/lib/analytics";
import { renderShareCard, type ShareCardInput } from "@/lib/share/renderShareCard";
import { SHARE_CARD_TEXT, shareLink } from "@/lib/share/shareMoment";

const T = SHARE_CARD_TEXT;

// ปุ่มรองในแถว .sd-acts — browser เท่านั้น (native ยังไม่มี plugin แชร์)
export default function ShareMomentButton({ card }: { card: ShareCardInput }) {
  const { moment } = card;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const blobRef = useRef<Promise<Blob> | null>(null);
  const cardRef = useRef(card);

  // ทำรูปไว้ล่วงหน้า: navigator.share ต้องเรียกใกล้จังหวะกด ถ้ารอวาดนานเกิน browser จะปฏิเสธ
  function prepare(): Promise<Blob> {
    blobRef.current ??= renderShareCard(cardRef.current);
    return blobRef.current;
  }

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    prepare().catch(() => {
      blobRef.current = null;
    });
  }, []);

  if (Capacitor.isNativePlatform()) return null;

  async function saveAndCopy(blob: Blob, link: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quizmon-${moment}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      // แจ้งเฉพาะว่าบันทึกรูปแล้ว
    }
    setNotice(copied ? T.downloaded : T.downloadedNoCopy);
    track("share_completed", { moment, method: "download" });
  }

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    track("share_card_opened", { moment });
    const link = shareLink(moment);
    try {
      const blob = await prepare();
      const file = new File([blob], `quizmon-${moment}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          // ลิงก์อยู่ใน text: บางแพลตฟอร์มทิ้งไฟล์ถ้าส่ง url คู่กับ files
          await navigator.share({ files: [file], text: T.shareText(link) });
          track("share_completed", { moment, method: "share" });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            track("share_cancelled", { moment });
          } else {
            await saveAndCopy(blob, link);
          }
        }
      } else {
        await saveAndCopy(blob, link);
      }
    } catch {
      blobRef.current = null;
      setNotice(T.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="sd-btn ghost" disabled={busy} onClick={handleShare}>
        {busy ? T.buttonBusy : T.button}
      </button>
      {notice && (
        <p className="sd-end-lead" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
