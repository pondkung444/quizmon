"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/social/BottomSheet";
import SchoolAutocomplete from "@/components/SchoolAutocomplete";
import { GUEST_SCHOOL_PROMPT_FLAG } from "@/components/GuestUpgradeGate";

// หลังผูกไอดีด้วย Google สำเร็จ ถ้า profiles.school ยังว่าง → ถามครั้งเดียวแบบไม่บังคับ
// เรนเดอร์จาก layout เมื่อ !is_anonymous && ไม่มี school — self-gate ด้วย localStorage flag
// ที่ GuestUpgradeGate ตั้งไว้ตอนกด "ผูกด้วย Google"
export default function GuestSchoolPrompt({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [school, setSchool] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // อ่านหลัง mount (rAF) กัน hydration mismatch + cascading render จาก localStorage ที่ SSR ไม่มี
    const id = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(GUEST_SCHOOL_PROMPT_FLAG) === "1") setOpen(true);
      } catch {
        /* private mode — ไม่ต้องโชว์ */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function clearFlag() {
    try {
      localStorage.removeItem(GUEST_SCHOOL_PROMPT_FLAG);
    } catch {
      /* noop */
    }
  }

  function handleSkip() {
    clearFlag();
    setOpen(false);
  }

  async function handleSave() {
    const value = school.trim();
    if (!value || saving) {
      handleSkip();
      return;
    }
    setSaving(true);
    await supabase.from("profiles").update({ school: value }).eq("id", userId);
    setSaving(false);
    clearFlag();
    setOpen(false);
    router.refresh();
  }

  if (!open) return null;

  return (
    <BottomSheet title="อยากเพิ่มโรงเรียนไหม" onClose={handleSkip}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text2">
          ใส่ชื่อโรงเรียนไว้เพื่อเทียบอันดับกับเพื่อนในโรงเรียนเดียวกัน — ข้ามไปก่อนก็ได้ ค่อยมาเพิ่มทีหลังในหน้าตั้งค่า
        </p>
        <SchoolAutocomplete value={school} onChange={setSchool} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text2 active:scale-95"
          >
            ข้ามไปก่อน
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl border border-gold bg-amber py-2.5 text-sm font-bold text-track active:scale-95 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
