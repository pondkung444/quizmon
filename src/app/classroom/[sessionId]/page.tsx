import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudentLobbyClient from "./StudentLobbyClient";
import type { ClassroomSession } from "@/lib/classroom/useClassroomLobby";

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

  const { data: session } = await supabase
    .from("classroom_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) redirect("/classroom/join");

  return <StudentLobbyClient sessionId={sessionId} initialSession={session as ClassroomSession} />;
}
