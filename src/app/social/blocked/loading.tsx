import { SkelBackLink, SkelBlock, SkelRows } from "@/components/social/skeleton";

export default function BlockedAccountsLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SkelBackLink />
      <SkelBlock className="h-5 w-32" />
      <SkelRows count={3} />
    </main>
  );
}
