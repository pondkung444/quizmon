import { SkelBackLink, SkelBlock } from "@/components/social/skeleton";

export default function AddFriendLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SkelBackLink />
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-gold-dim bg-card p-6">
        <SkelBlock className="h-3 w-28" />
        <SkelBlock className="h-8 w-40" />
        <SkelBlock className="mt-1 h-11 w-24 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        <SkelBlock className="h-4 w-40" />
        <SkelBlock className="h-11 w-full rounded-xl" />
      </div>
    </main>
  );
}
