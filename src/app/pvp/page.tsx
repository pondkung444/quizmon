import { createClient } from "@/lib/supabase/server";
import { requirePvpAccess, getPvpOverview } from "@/lib/pvp";
import PvpOverviewClient from "./PvpOverviewClient";

// สไลซ์ 1: เข้าผ่าน URL ตรงเท่านั้น (ยังไม่ทำเมนูล่าง) — gate ด้วย pvp_allowlist
export const dynamic = "force-dynamic";

export default async function PvpPage() {
  const user = await requirePvpAccess();
  const supabase = await createClient();
  const overview = await getPvpOverview(supabase, user.id);
  return <PvpOverviewClient overview={overview} />;
}
