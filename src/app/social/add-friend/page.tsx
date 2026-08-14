import { createClient, getUser } from "@/lib/supabase/server";
import SignOutLink from "@/components/SignOutLink";
import AddFriendView from "@/components/social/AddFriendView";

export default async function AddFriendPage() {
  const user = await getUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อเพิ่มเพื่อน
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("friend_code").eq("id", user.id).maybeSingle();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <AddFriendView myFriendCode={data?.friend_code ?? ""} />
    </main>
  );
}
