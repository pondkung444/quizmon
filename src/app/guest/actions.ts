"use server";

import { createClient } from "@/lib/supabase/server";

export type GuestReadiness = {
  ready: boolean;
  gradeLevel: string | null;
  gradeBand: string | null;
  friendCode: string | null;
  starterEggCount: number;
  repaired: boolean;
};

export async function ensureGuestReady(): Promise<GuestReadiness> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.is_anonymous) throw new Error("ไม่พบ Guest session");

  async function readReadiness(repaired: boolean): Promise<GuestReadiness> {
    const [{ data: profile }, { count: starterEggCount }, { count: petCount }] = await Promise.all([
      supabase.from("profiles").select("grade_level, grade_band, friend_code").eq("id", user!.id).maybeSingle(),
      supabase
        .from("player_eggs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("source", "starter")
        .is("hatched_at", null),
      supabase.from("pets").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
    ]);
    const eggCount = starterEggCount ?? 0;
    return {
      ready: !!profile?.grade_level && !!profile?.grade_band && !!profile?.friend_code && (eggCount === 1 || (petCount ?? 0) > 0),
      gradeLevel: profile?.grade_level ?? null,
      gradeBand: profile?.grade_band ?? null,
      friendCode: profile?.friend_code ?? null,
      starterEggCount: eggCount,
      repaired,
    };
  }

  const initial = await readReadiness(false);
  if (initial.ready) return initial;

  const { error } = await supabase.rpc("repair_guest_provisioning");
  if (error) throw new Error("เตรียมไข่ยังไม่สำเร็จ");

  const repaired = await readReadiness(true);
  if (!repaired.ready) throw new Error("เตรียมไข่ยังไม่สำเร็จ");
  return repaired;
}
