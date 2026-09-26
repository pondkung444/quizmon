import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { summarizeHistory, type HistoryMatch } from "./historyStats";

type Client = Awaited<ReturnType<typeof createClient>>;
const BATCH_SIZE = 500;
export const HISTORY_PAGE_SIZE = 12;

export function historyPage(value: string | string[] | undefined) {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}

export async function getPvpHistorySummary(supabase: Client, userId: string, opponentId?: string) {
  const rows: HistoryMatch[] = [];
  // Read every page: Supabase's row limit must not silently truncate lifetime stats.
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const query = supabase.from("pvp_matches")
      .select("id, player_a_id, player_b_id, status, outcome, last_action_at")
      .or(opponentId
        ? `and(player_a_id.eq.${userId},player_b_id.eq.${opponentId}),and(player_b_id.eq.${userId},player_a_id.eq.${opponentId})`
        : `player_a_id.eq.${userId},player_b_id.eq.${userId}`)
      .in("status", ["finished", "abandoned"])
      .order("id").range(offset, offset + BATCH_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error("โหลดสถิติประลองไม่สำเร็จ", { cause: error });
    rows.push(...(data ?? []));
    if (!data || data.length < BATCH_SIZE) break;
  }
  const summary = summarizeHistory(rows, userId);
  if (summary.rivals.length) {
    const admin = createAdminClient();
    const ids = summary.rivals.map(r => r.opponentId);
    const names = new Map<string, string>();
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      const { data, error } = await admin.from("profiles").select("id, username").in("id", ids.slice(offset, offset + BATCH_SIZE));
      if (error) throw new Error("โหลดชื่อคู่ต่อสู้ไม่สำเร็จ", { cause: error });
      for (const profile of data ?? []) names.set(profile.id, profile.username ?? "คู่ต่อสู้");
    }
    for (const rival of summary.rivals) rival.opponentName = names.get(rival.opponentId) ?? "คู่ต่อสู้";
  }
  return summary;
}

export async function getPvpRivalMatches(supabase: Client, userId: string, opponentId: string, page: number) {
  const { data, count, error } = await supabase.from("pvp_matches")
    .select("id, player_a_id, player_b_id, status, outcome, last_action_at, current_round, hp_a, hp_b", { count: "exact" })
    .or(`and(player_a_id.eq.${userId},player_b_id.eq.${opponentId}),and(player_b_id.eq.${userId},player_a_id.eq.${opponentId})`)
    .in("status", ["finished", "abandoned"])
    .order("last_action_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE - 1);
  if (error) throw new Error("โหลดประวัติประลองไม่สำเร็จ", { cause: error });
  return { matches: data ?? [], count: count ?? 0 };
}
