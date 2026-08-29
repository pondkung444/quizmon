"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// QR ของลิงก์เข้าห้อง — นักเรียนสแกนจากจอครู/ทีวีแทนการพิมพ์รหัสหรือเปิดลิงก์เอง
export default function JoinQr({ url, size = 180 }: { url: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: size * 3,
      color: { dark: "#1f2127ff", light: "#f5f5f4ff" },
    }).then((d) => {
      if (!cancelled) setSrc(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!src) {
    return (
      <div
        className="animate-pulse rounded-xl bg-track"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="QR สำหรับเข้าห้อง"
      width={size}
      height={size}
      className="rounded-xl bg-text"
    />
  );
}
