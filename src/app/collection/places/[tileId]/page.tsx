import PlaceHistoryView from "@/components/farm/PlaceHistoryView";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadPlaceHistory } from "@/lib/farm/history-server";
export default async function PlacePage({
  params,
}: {
  params: Promise<{ tileId: string }>;
}) {
  if (!(await getUser())) redirect("/login");
  const place = await loadPlaceHistory((await params).tileId);
  if (!place) notFound();
  return <PlaceHistoryView place={place} />;
}
