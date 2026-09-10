import { notFound } from "next/navigation";
import RaidCardPreview from "@/components/raid/RaidCardPreview";

export default function RaidPreviewPage() {
  if (process.env.NODE_ENV === "production" || process.env.RAID_CARD_PREVIEW !== "true") notFound();
  return <RaidCardPreview />;
}
