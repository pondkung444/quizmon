"use client";

import { useCallback } from "react";
import { appAudio, type AppSfxName } from "@/lib/audio/appAudio";

type SfxOptions = { playbackRate?: number; volume?: number };

// hook เล็กๆ ให้ component เรียก SFX ได้สั้นๆ — no-op เองถ้าเสียงปิด / ยังไม่ unlock / ไฟล์ยังไม่มี
export function useSfx() {
  return useCallback((name: AppSfxName, opts?: SfxOptions) => {
    appAudio.sfx(name, opts);
  }, []);
}
