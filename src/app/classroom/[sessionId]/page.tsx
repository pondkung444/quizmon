import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudentLobbyClient from "./StudentLobbyClient";
import type { ClassroomParticipant, ClassroomSession } from "@/lib/classroom/useClassroomLobby";

export default async function StudentClassroomPage({
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

  const [{ data: session }, { data: roster }] = await Promise.all([
    supabase.from("classroom_sessions").select("*").eq("id", sessionId).maybeSingle(),
    supabase.rpc("get_classroom_roster", { p_session_id: sessionId }),
  ]);

  if (!session) redirect("/classroom/join");

  return (
    <StudentLobbyClient
      sessionId={sessionId}
      userId={user.id}
      initialSession={session as ClassroomSession}
      initialParticipants={(roster as ClassroomParticipant[] | null) ?? []}
    />
  );
}
