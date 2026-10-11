import { getUser } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { loadFriendFarm } from "@/lib/farm/social-server";
import VisitFarmClient from "@/components/farm/VisitFarmClient";
export default async function VisitPage({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  if (!(await getUser())) redirect("/login");
  const { ownerId } = await params,
    farm = await loadFriendFarm(ownerId);
  if (!farm) notFound();
  return <VisitFarmClient owner={ownerId} farm={farm} />;
}
