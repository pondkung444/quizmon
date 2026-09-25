import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TeacherRoomClient from "./TeacherRoomClient";
import type { ClassroomParticipant, ClassroomSession } from "@/lib/classroom/useClassroomLobby";

export default async function TeacherClassroomPage({
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

  const [{ data: session }, { data: participants }] = await Promise.all([
    supabase.from("classroom_sessions").select("*").eq("id", sessionId).maybeSingle(),
    supabase.rpc("get_classroom_roster", { p_session_id: sessionId }),
  ]);

  if (!session || session.teacher_id !== user.id) redirect("/teacher");

  return (
    <TeacherRoomClient
      sessionId={sessionId}
      initialSession={session as ClassroomSession}
      initialParticipants={(participants as ClassroomParticipant[] | null) ?? []}
    />
  );
}
