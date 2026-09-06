"use client";

import { useEffect } from "react";
import { markSeenAuth } from "@/lib/seenAuth";

// mount ใน root layout — การันตีว่า "ทุก" ทางเข้าที่ login สำเร็จแบบไม่ใช่ guest
// (รวม Google OAuth ที่ callback route เด้งไป /pet ตรงๆ ไม่ผ่านหน้า /login) จะ set
// localStorage.qm_seen_auth ให้ครั้งถัดไป /login ขึ้น State C ได้
export default function SeenAuthFlag({ authed }: { authed: boolean }) {
  useEffect(() => {
    if (authed) markSeenAuth();
  }, [authed]);

  return null;
}
