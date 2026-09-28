import Link from "next/link";
import { Shield, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyGuardianHub } from "@/lib/guardianHub";

// ทางเข้าศูนย์ผู้พิทักษ์จาก /pet (เฟส 1) — async server component ห่อด้วย Suspense ที่ /pet
// จึงไม่ถ่วง render หน้าหลัก เด็กที่ไม่อยู่ใน allowlist ยิงแค่ is_guardian_admin แล้วคืน null
// (ไม่เรียก hub) ไม่มี claimed / error → null ไม่มีอะไรเปลี่ยนบนหน้า
export default async function GuardianHubLink({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: isEnabled } = await supabase.rpc("is_guardian_admin", { p_user_id: userId });
  if (!isEnabled) return null;

  const hub = await getMyGuardianHub(supabase);
  if (!hub) return null;

  const first = hub.plan?.subjects.find((s) => !s.done && s.current_chapter) ?? null;

  return (
    <Link
      href="/social?tab=profile"
      className="flex items-center gap-2 rounded-xl border border-gold-dim bg-card px-4 py-3 text-sm transition active:scale-[0.98]"
    >
      <Shield className="h-4 w-4 flex-none text-gold-hi" />
      <span className="min-w-0 flex-1 truncate text-text2">
        <span className="font-bold text-gold-hi">ผู้พิทักษ์</span>
        {first && <> · กำลังทบทวน: {first.current_chapter}</>}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-text3" />
    </Link>
  );
}
