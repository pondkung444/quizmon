import { createClient, getUser } from "@/lib/supabase/server";
import { getReceivedEncouragements } from "@/lib/encouragements";
import SignOutLink from "@/components/SignOutLink";
import EncouragementsView from "@/components/social/EncouragementsView";

export default async function EncouragementsPage() {
  const user = await getUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูกำลังใจ
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const received = await getReceivedEncouragements(supabase);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <EncouragementsView received={received} />
    </main>
  );
}
