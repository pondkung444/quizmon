import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TvClient from "./TvClient";
import type { TvRankedParticipant, TvSession } from "@/lib/bossRaid/useBossRaidTv";

// จอทีวี/โปรเจกเตอร์ที่ครูเปิดหน้าห้อง — server component ดึง snapshot เริ่มต้น (กัน flash ก่อน realtime ต่อ)
// RLS คุมการเห็นเอง: ไม่ใช่ member (ครูเจ้าของ / นักเรียนในห้อง) -> maybeSingle คืน null -> notFound
// ไม่จำกัดเฉพาะครู: จอนี้ read-only ล้วน นักเรียนเปิดดูเองก็ไม่มีผลอะไร (ตรง permission model เดิมของระบบ)
export default async function BossRaidTvPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("boss_raid_sessions")
    .select(
      "id, status, join_code, config, boss_hp, boss_hp_max, crystal_hp, crystal_hp_max, current_tier, wrong_count_total, active_event, result"
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: ranked }, { count }, { data: nameRows }] = await Promise.all([
    supabase
      .from("boss_raid_participants")
      .select("id, total_damage, joined_at")
      .eq("session_id", sessionId)
      .order("total_damage", { ascending: false })
      .order("joined_at", { ascending: true })
      .limit(5),
    supabase
      .from("boss_raid_participants")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
    supabase.rpc("get_boss_raid_participant_names", { p_session_id: sessionId }),
  ]);

  const names: Record<string, string> = {};
  for (const r of (nameRows ?? []) as { participant_id: string; display_name: string }[]) {
    names[r.participant_id] = r.display_name;
  }

  return (
    <TvClient
      sessionId={sessionId}
      initialSession={session as TvSession}
      initialTopFive={(ranked ?? []) as TvRankedParticipant[]}
      initialParticipantCount={count ?? 0}
      initialNames={names}
    />
  );
}
