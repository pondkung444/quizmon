import SocialTabsView from "@/components/SocialTabsView";

const VALID_TABS = ["ranking", "friends", "profile"];

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = VALID_TABS.includes(tab ?? "") ? (tab as string) : "ranking";

  return <SocialTabsView initialTab={initialTab} />;
}
