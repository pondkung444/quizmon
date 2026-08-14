import { createClient, getUser } from "@/lib/supabase/server";
import { getMyBlockedAccounts } from "@/lib/friends";
import SignOutLink from "@/components/SignOutLink";
import BlockedAccountsView from "@/components/social/BlockedAccountsView";

export default async function BlockedAccountsPage() {
  const user = await getUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูบัญชีที่บล็อก
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const blocked = await getMyBlockedAccounts(supabase);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <BlockedAccountsView blocked={blocked} />
    </main>
  );
}
