import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { getFriendProfile } from "@/lib/friendProfile";
import { getHasSentEncouragementToday } from "@/lib/encouragements";
import SignOutLink from "@/components/SignOutLink";
import FriendProfileShell from "@/components/social/FriendProfileShell";

export default async function FriendProfilePage({
  params,
}: {
  params: Promise<{ friendUserId: string }>;
}) {
  const { friendUserId } = await params;

  const user = await getUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูโปรไฟล์เพื่อน
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const profile = await getFriendProfile(supabase, friendUserId);
  // RPC เช็คความเป็นเพื่อนเองแล้ว (defensive) — ไม่ใช่เพื่อนกันจริงก็ found:false เหมือน 404 ปกติ
  if (!profile.found) notFound();

  // เรียกคู่กับ getFriendProfile แทนแก้ signature ของ RPC เดิม (เฟส 6) — ปุ่ม "ส่งกำลังใจ" ต้องรู้
  // สถานะ disabled ตั้งแต่โหลดหน้า ไม่ต้องรอกดก่อนถึงจะรู้
  const alreadySentEncouragementToday = await getHasSentEncouragementToday(supabase, friendUserId);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <FriendProfileShell profile={profile} initialAlreadySentEncouragementToday={alreadySentEncouragementToday} />
    </main>
  );
}
