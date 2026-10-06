import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BattleSetupClient from "./BattleSetupClient";

// Team Battle — หน้าครู (ตั้งค่า + แบ่งทีม + แผงสถานะชั่วคราว) เข้าด้วย URL ตรงเท่านั้น (ทางเข้าอยู่ PR 4.5)
export default async function TeacherBattlePage({
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
    .from("classroom_sessions")
    .select("id, teacher_id, title, status, active_team_battle_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.teacher_id !== user.id) redirect("/teacher");
  if (session.status === "ended") redirect(`/teacher/${sessionId}`);

  // เกมที่ยังเปิดอยู่ (setup/active) เท่านั้น — เกมที่จบแล้วให้เริ่มใหม่ได้เลย
  let openBattleId: string | null = null;
  if (session.active_team_battle_id) {
    const { data: battle } = await supabase
      .from("pvp_team_battles")
      .select("id, status")
      .eq("id", session.active_team_battle_id)
      .maybeSingle();
    if (battle && (battle.status === "setup" || battle.status === "active")) openBattleId = battle.id;
  }

  return (
    <BattleSetupClient
      sessionId={sessionId}
      title={session.title ?? "ห้องเรียน"}
      initialBattleId={openBattleId}
    />
  );
}
