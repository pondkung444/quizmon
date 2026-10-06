import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BattleStudentClient from "./BattleStudentClient";

// Team Battle — หน้านักเรียน (มือถือ) ส่ง battleId ให้ client ได้ทุกสถานะ (setup/active/finished/abandoned)
// client จัดการหน้าจบเอง; ไม่มีเกม/ไม่ใช่สมาชิก → กลับ lobby/หน้ากรอกรหัส
export default async function StudentBattlePage({
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

  // RLS ให้เห็นห้องเฉพาะสมาชิก/ครู — ไม่เห็น = ไม่ใช่สมาชิก
  const { data: session } = await supabase
    .from("classroom_sessions")
    .select("id, status, active_team_battle_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) redirect("/classroom/join");

  const { data: me } = await supabase
    .from("classroom_participants")
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) redirect("/classroom/join");

  if (!session.active_team_battle_id) redirect(`/classroom/${sessionId}`);

  const { data: battle } = await supabase
    .from("pvp_team_battles")
    .select("id")
    .eq("id", session.active_team_battle_id)
    .maybeSingle();
  if (!battle) redirect(`/classroom/${sessionId}`);

  return <BattleStudentClient sessionId={sessionId} userId={user.id} battleId={battle.id} />;
}
