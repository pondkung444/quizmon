import { SkelBackLink, SkelRows, SkelSegmentedTabs } from "@/components/social/skeleton";

export default function RequestsLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SkelBackLink />
      <SkelSegmentedTabs labels={["ได้รับ", "ส่งแล้ว"]} />
      <SkelRows count={4} />
    </main>
  );
}
