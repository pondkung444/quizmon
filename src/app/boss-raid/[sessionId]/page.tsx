import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LobbyClient from "./LobbyClient";
import type { LobbyParticipant, LobbySession } from "@/lib/bossRaid/useBossRaidLobby";

// จอห้อง (ครู/ทีวี และนักเรียนที่ join แล้ว) — server component ดึง snapshot เริ่มต้น
// RLS คุมการเห็นเอง: ไม่ใช่ member -> maybeSingle คืน null -> notFound
export default async function BossRaidSessionPage({
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
      "id, status, join_code, config, teacher_id, boss_hp, boss_hp_max, crystal_hp, crystal_hp_max, current_tier, wrong_count_total"
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) notFound();

  const { data: participants } = await supabase
    .from("boss_raid_participants")
    .select("id, user_id, pet_id, stat_snapshot, joined_at, current_question_id, question_started_at")
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });

  return (
    <LobbyClient
      sessionId={sessionId}
      userId={user.id}
      isTeacher={session.teacher_id === user.id}
      initialSession={session as LobbySession}
      initialParticipants={(participants ?? []) as LobbyParticipant[]}
    />
  );
}
