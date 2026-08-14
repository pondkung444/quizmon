import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { getPublicProfile } from "@/lib/publicProfile";
import SignOutLink from "@/components/SignOutLink";
import PublicProfileView from "@/components/social/PublicProfileView";

// S04 — ทางเข้าจริงตอนนี้: การ์ดผลค้นหาใน S06, การ์ดคำขอใน S07 (Leaderboard เป็นเฟส 8 ยังไม่มี)
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ targetUserId: string }>;
}) {
  const { targetUserId } = await params;

  const user = await getUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูโปรไฟล์
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const profile = await getPublicProfile(supabase, targetUserId);

  // self/friends เห็นเนื้อหาได้มากกว่า S04 — redirect ไปหน้าที่เหมาะสมทันทีฝั่ง server ไม่ flash S04 ก่อน
  if (profile.found && profile.relationshipStatus === "self") {
    redirect("/social?tab=profile");
  }
  if (profile.found && profile.relationshipStatus === "friends") {
    redirect(`/social/friend/${targetUserId}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      {!profile.found ? (
        <div className="flex flex-col gap-6">
          <Link href="/social" className="flex items-center gap-1 text-sm text-text3 transition hover:text-gold-hi">
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Link>
          {/* ข้อความเดียวกันทั้ง "ไม่มีอยู่จริง" และ "ถูกบล็อก" — ห้าม leak สถานะบล็อก (§6.9) */}
          <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
            ไม่พบ Profile
          </div>
        </div>
      ) : (
        <PublicProfileView profile={profile} />
      )}
    </main>
  );
}
