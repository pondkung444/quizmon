import { createClient, getUser } from "@/lib/supabase/server";
import { getFriendRequestLists } from "@/lib/friendRequests";
import SignOutLink from "@/components/SignOutLink";
import FriendRequestsView from "@/components/social/FriendRequestsView";

export default async function FriendRequestsPage() {
  const user = await getUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูคำขอเป็นเพื่อน
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { received, sent } = await getFriendRequestLists(supabase);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <FriendRequestsView received={received} sent={sent} />
    </main>
  );
}
