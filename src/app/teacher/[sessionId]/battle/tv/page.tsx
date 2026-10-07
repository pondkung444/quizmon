import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BattleTvClient from "./BattleTvClient";

// Team Battle — จอ TV อ่านอย่างเดียว (เปิดแท็บแยกจากหน้าคุมเกม): ไม่ยิง tick ไม่มีปุ่มจบเกม ไม่มีชื่อรายคน
// สิทธิ์เหมือนหน้า battle: ต้องเป็นครูเจ้าของห้อง
export default async function TeacherBattleTvPage({
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
    .select("id, teacher_id, status, active_team_battle_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.teacher_id !== user.id) redirect("/teacher");
  if (session.status === "ended") redirect(`/teacher/${sessionId}`);

  return <BattleTvClient sessionId={sessionId} battleId={session.active_team_battle_id ?? null} />;
}
