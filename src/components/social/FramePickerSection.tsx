"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PetAvatarFrame from "@/components/social/PetAvatarFrame";

type FrameRow = {
  id: string;
  tier: string;
  frame_name: string;
  is_unlocked: boolean;
  is_equipped: boolean;
};

// โชว์เฉพาะตอนมีกรอบปลดล็อกแล้วอย่างน้อย 1 อัน (คนส่วนใหญ่ยังไม่มีเลยตอนนี้ — ไม่อยากให้เจอ
// ส่วนว่างเปล่าไม่มีประโยชน์) เลือกกรอบว่าง (null) ได้เสมอเพื่อถอดกรอบออก
export default function FramePickerSection() {
  const supabase = createClient();
  const [frames, setFrames] = useState<FrameRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.rpc("get_my_frames").then(({ data }) => setFrames(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEquip(frameId: string | null) {
    if (submitting) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("set_equipped_frame", { p_frame_id: frameId });
    setSubmitting(false);
    if (error) return;
    setFrames((prev) => prev?.map((f) => ({ ...f, is_equipped: f.id === frameId })) ?? prev);
  }

  const unlocked = frames?.filter((f) => f.is_unlocked) ?? [];
  if (!frames || unlocked.length === 0) return null;

  const currentlyEquipped = unlocked.some((f) => f.is_equipped);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold text-gold-hi">กรอบโปรไฟล์</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {unlocked.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={submitting}
            onClick={() => handleEquip(f.id)}
            className="flex flex-none flex-col items-center gap-1.5 disabled:opacity-50"
          >
            <PetAvatarFrame tier={f.tier} size={64}>
              <div className="flex h-full w-full items-center justify-center bg-track text-2xl">🐲</div>
            </PetAvatarFrame>
            <span className="flex items-center gap-1 text-xs text-text3">
              {f.is_equipped && <Check className="h-3.5 w-3.5 text-gold-hi" />}
              {f.frame_name}
            </span>
          </button>
        ))}
        <button
          type="button"
          disabled={submitting || !currentlyEquipped}
          onClick={() => handleEquip(null)}
          className="flex flex-none flex-col items-center gap-1.5 disabled:opacity-30"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-text3 text-2xl">🐲</div>
          <span className="text-xs text-text3">ไม่ใส่กรอบ</span>
        </button>
      </div>
    </section>
  );
}
