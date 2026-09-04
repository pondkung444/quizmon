import { redirect } from "next/navigation";
import { getUser, type createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName, parsePetLine } from "@/lib/petLine";
import type { Personality, Subline } from "@/lib/evolution";
import { parsePvpStats, type PvpCard, type PvpPetStats } from "@/lib/pvp/stats";
import { pvpTimerSecondsForCard } from "@/lib/pvp/combat";
import type { PetDisplayInput } from "@/components/social/petSummary";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// auth + allowlist ในจุดเดียว (pattern เดียวกับ requireRaidAccess) — ทุก page/action ของ /pvp เรียกตัวนี้
export async function requirePvpAccess(): Promise<{ id: string }> {
  const user = await getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data } = await admin
    .from("pvp_allowlist")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) redirect("/pet");
  return user;
}

export type PvpPetPick = {
  id: string;
  nickname: string | null;
  speciesName: string;
  imagePath: string;
  subline: string;
  stats: PvpPetStats;
  statTotal: number;
  matchCount: number; // จำนวนแมตช์ PvP ทั้งหมด (all-time) ที่ Qmon ตัวนี้เคยลงสนาม — ใช้ตัดสิน badge "ใช้บ่อย"
};

// Qmon ที่ประลองได้ — stage 4 เท่านั้น (ไม่กรอง is_active — stage 4 ทุกตัว is_active=false)
export async function getPvpEligiblePets(userId: string): Promise<PvpPetPick[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pets")
    .select(
      "id, nickname, stage, subline, personality, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, hatched_at, egg_types(sprite_prefix, name_th)"
    )
    .eq("user_id", userId)
    .eq("stage", 4)
    .order("hatched_at", { ascending: false });

  const rows = data ?? [];
  const petIds = rows.map((r) => r.id);
  const matchCounts = new Map<string, number>();
  if (petIds.length > 0) {
    const { data: matches } = await admin
      .from("pvp_matches")
      .select("pet_a_id, pet_b_id")
      .or(`pet_a_id.in.(${petIds.join(",")}),pet_b_id.in.(${petIds.join(",")})`);
    for (const m of matches ?? []) {
      if (m.pet_a_id && petIds.includes(m.pet_a_id)) {
        matchCounts.set(m.pet_a_id, (matchCounts.get(m.pet_a_id) ?? 0) + 1);
      }
      if (m.pet_b_id && petIds.includes(m.pet_b_id)) {
        matchCounts.set(m.pet_b_id, (matchCounts.get(m.pet_b_id) ?? 0) + 1);
      }
    }
  }

  const pets: PvpPetPick[] = [];
  for (const row of rows) {
    const egg = (Array.isArray(row.egg_types) ? row.egg_types[0] : row.egg_types) as
      | { sprite_prefix: string; name_th: string }
      | null;
    const line = parsePetLine(row.subline);
    if (!egg || !line || !row.personality) continue;
    try {
      const stats = parsePvpStats({
        hp: row.stat_hp,
        atk: row.stat_atk,
        def: row.stat_def,
        spd: row.stat_spd,
        foc: row.stat_foc,
      });
      pets.push({
        id: row.id,
        nickname: row.nickname,
        speciesName: getSpeciesName(
          egg.sprite_prefix,
          4,
          line,
          row.personality as Personality,
          egg.name_th
        ),
        imagePath: getPetImagePath(egg.sprite_prefix, 4, line as Subline, row.personality as Personality),
        subline: row.subline as string,
        stats,
        statTotal: stats.hp + stats.atk + stats.def + stats.spd + stats.foc,
        matchCount: matchCounts.get(row.id) ?? 0,
      });
    } catch {
      // pet ข้อมูลไม่ครบ (เช่น sprite mapping ล้ม) — ข้าม
    }
  }
  return pets;
}

// สไลซ์ 4: Qmon ที่ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้ (ผูกกับ PvP อยู่) — ตรงกับ lock ใน equip_raid_gear
//   - เป็น challenger_pet_id ของคำท้าที่ status='pending'
//   - เป็น pet_a/pet_b ของแมตช์ที่ status='active'
export async function getPvpGearLockedPetIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: myPets }, { data: pending }, { data: active }] = await Promise.all([
    admin.from("pets").select("id").eq("user_id", userId),
    admin
      .from("pvp_challenges")
      .select("challenger_pet_id")
      .eq("challenger_id", userId)
      .eq("status", "pending"),
    admin
      .from("pvp_matches")
      .select("pet_a_id, pet_b_id")
      .eq("status", "active")
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`),
  ]);
  const mine = new Set((myPets ?? []).map((p) => p.id as string));
  const locked = new Set<string>();
  for (const c of pending ?? []) {
    if (c.challenger_pet_id) locked.add(c.challenger_pet_id as string);
  }
  for (const m of active ?? []) {
    if (m.pet_a_id && mine.has(m.pet_a_id as string)) locked.add(m.pet_a_id as string);
    if (m.pet_b_id && mine.has(m.pet_b_id as string)) locked.add(m.pet_b_id as string);
  }
  return [...locked];
}

export type ChallengeableFriend = {
  userId: string;
  username: string;
  gradeBand: string;
  matchCount: number; // จำนวนแมตช์ที่เคยเล่นจริงกับเพื่อนคนนี้ (all-time) — ใช้เรียงแถว "ท้าบ่อยล่าสุด"
  friendsSince: string; // fallback sort เมื่อยังไม่มีประวัติแมตช์เลย (บัญชีใหม่)
  pet: (PetDisplayInput & { nickname: string | null }) | null; // Qmon ที่ภูมิใจของเพื่อน (fallback: ตัวที่ active)
};

// เพื่อนที่ประลองได้ = เพื่อนที่ยืนยันแล้ว + grade_band เดียวกับเรา (ไม่ null)
// เรียงตามจำนวนแมตช์ที่เคยเล่นจริงด้วยกัน (มาก -> น้อย) ตามด้วยเพื่อนใหม่สุดก่อนเมื่อยังไม่เคยเล่น
export async function getChallengeableFriends(userId: string): Promise<ChallengeableFriend[]> {
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("grade_band").eq("id", userId).maybeSingle();
  const myBand = me?.grade_band ?? null;
  if (!myBand) return [];

  const { data: rows } = await admin
    .from("friendships")
    .select("user_id_low, user_id_high, created_at")
    .or(`user_id_low.eq.${userId},user_id_high.eq.${userId}`);

  const friendsSinceById = new Map<string, string>();
  for (const r of rows ?? []) {
    const friendId = r.user_id_low === userId ? r.user_id_high : r.user_id_low;
    friendsSinceById.set(friendId, r.created_at as string);
  }
  const friendIds = [...friendsSinceById.keys()];
  if (friendIds.length === 0) return [];

  const [{ data: profs }, { data: settings }, { data: activePets }, { data: matches }] = await Promise.all([
    admin.from("profiles").select("id, username, grade_band").in("id", friendIds).eq("grade_band", myBand),
    admin.from("profile_settings").select("user_id, pride_pet_id").in("user_id", friendIds),
    admin.from("pets").select("id, user_id").in("user_id", friendIds).eq("is_active", true),
    admin
      .from("pvp_matches")
      .select("player_a_id, player_b_id")
      .or(
        `and(player_a_id.eq.${userId},player_b_id.in.(${friendIds.join(",")})),and(player_b_id.eq.${userId},player_a_id.in.(${friendIds.join(",")}))`
      ),
  ]);

  const eligibleFriends = profs ?? [];
  if (eligibleFriends.length === 0) return [];

  // Qmon ที่ภูมิใจ (pride_pet_id) -> fallback ตัวที่ active — pattern เดียวกับ _ranking_pride_pet_id ใน SQL
  const activePetByUser = new Map((activePets ?? []).map((p) => [p.user_id as string, p.id as string]));
  const prideByUser = new Map((settings ?? []).map((s) => [s.user_id as string, s.pride_pet_id as string | null]));
  const showcasePetIdByUser = new Map<string, string>();
  for (const f of eligibleFriends) {
    const petId = prideByUser.get(f.id) ?? activePetByUser.get(f.id);
    if (petId) showcasePetIdByUser.set(f.id, petId);
  }

  const showcasePetIds = [...showcasePetIdByUser.values()];
  const petDetailById = new Map<string, PetDisplayInput & { nickname: string | null }>();
  if (showcasePetIds.length > 0) {
    const { data: petRows } = await admin
      .from("pets")
      .select("id, nickname, stage, subline, personality, egg_types(sprite_prefix, name_th)")
      .in("id", showcasePetIds);
    for (const p of petRows ?? []) {
      const egg = (Array.isArray(p.egg_types) ? p.egg_types[0] : p.egg_types) as
        | { sprite_prefix: string; name_th: string }
        | null;
      if (!egg) continue;
      petDetailById.set(p.id, {
        nickname: p.nickname,
        stage: p.stage,
        subline: p.subline,
        personality: p.personality,
        eggSpritePrefix: egg.sprite_prefix,
        eggNameTh: egg.name_th,
      });
    }
  }

  const matchCountByFriend = new Map<string, number>();
  for (const m of matches ?? []) {
    const friendId = m.player_a_id === userId ? m.player_b_id : m.player_a_id;
    matchCountByFriend.set(friendId, (matchCountByFriend.get(friendId) ?? 0) + 1);
  }

  const friends: ChallengeableFriend[] = eligibleFriends.map((p) => {
    const showcasePetId = showcasePetIdByUser.get(p.id);
    return {
      userId: p.id,
      username: p.username ?? "เพื่อน",
      gradeBand: p.grade_band as string,
      matchCount: matchCountByFriend.get(p.id) ?? 0,
      friendsSince: friendsSinceById.get(p.id) ?? new Date(0).toISOString(),
      pet: showcasePetId ? (petDetailById.get(showcasePetId) ?? null) : null,
    };
  });

  friends.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return b.friendsSince.localeCompare(a.friendsSince);
  });

  return friends;
}

export type PvpChallengeForAccept = {
  id: string;
  challengerName: string;
  challengerPetName: string;
  status: string;
  expiresAt: string;
};

export async function getPvpChallengeForAccept(
  supabase: SupabaseServerClient,
  userId: string,
  challengeId: string
): Promise<PvpChallengeForAccept | null> {
  const { data: c } = await supabase
    .from("pvp_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (!c || c.opponent_id !== userId) return null;

  const admin = createAdminClient();
  const [{ data: prof }, { data: pet }] = await Promise.all([
    admin.from("profiles").select("username").eq("id", c.challenger_id).maybeSingle(),
    admin
      .from("pets")
      .select("nickname, subline, personality, egg_types(sprite_prefix, name_th)")
      .eq("id", c.challenger_pet_id)
      .maybeSingle(),
  ]);

  let petName = pet?.nickname ?? "Qmon";
  const egg = (Array.isArray(pet?.egg_types) ? pet?.egg_types[0] : pet?.egg_types) as
    | { sprite_prefix: string; name_th: string }
    | null;
  const line = parsePetLine(pet?.subline ?? null);
  if (!pet?.nickname && egg && line && pet?.personality) {
    try {
      petName = getSpeciesName(egg.sprite_prefix, 4, line, pet.personality as Personality, egg.name_th);
    } catch {
      /* keep fallback */
    }
  }

  return {
    id: c.id,
    challengerName: prof?.username ?? "เพื่อน",
    challengerPetName: petName,
    status: c.status,
    expiresAt: c.expires_at,
  };
}

// ---- ภาพรวมหน้า /pvp ----------------------------------------------------------

export type PvpIncomingChallenge = {
  id: string;
  challengerId: string;
  challengerName: string;
  challengerPet: { speciesName: string; imagePath: string } | null;
  createdAt: string;
  expiresAt: string;
};

export type PvpOutgoingChallenge = {
  id: string;
  opponentName: string;
  status: "pending" | "declined";
  createdAt: string;
  expiresAt: string;
};

export type PvpMatchListItem = {
  id: string;
  opponentName: string;
  iAm: "a" | "b";
  hpMine: number;
  hpOpp: number;
  currentRound: number;
  status: "active" | "finished" | "abandoned";
  outcome: "a_win" | "b_win" | "draw" | null;
  iWon: boolean | null; // null = เสมอ/ถูกทิ้ง
  myTurn: boolean;
  updatedAt: string;
};

export type PvpOverview = {
  yourTurn: PvpMatchListItem[];
  waiting: PvpMatchListItem[];
  incoming: PvpIncomingChallenge[];
  outgoing: PvpOutgoingChallenge[];
  finished: PvpMatchListItem[];
  ticketBalance: number; // ตั๋วประลองที่ใช้ได้ (เติมวันละ 2 + raid bonus, เพดาน 15)
};

export const PVP_TICKET_CAP = 15;

// นับตั๋วที่ใช้ได้ของผู้ใช้ (หลัง lazy grant) — เรียกจากหน้า /pvp และ /pvp/new
export async function getPvpTicketBalance(
  supabase: SupabaseServerClient,
  userId: string
): Promise<number> {
  await supabase.rpc("pvp_grant_tickets");
  const { count } = await supabase
    .from("pvp_tickets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("consumed_at", null);
  return count ?? 0;
}

// ตรรกะ reconcile วิวัฒนาการ PvP ย้ายไป src/lib/petEvolution.ts (evolvePet) —
// ใช้ร่วมกับ finishQuizRound. server action = applyPvpMatchEvolution (src/app/pvp/actions.ts)

async function petSpriteMap(
  petIds: string[]
): Promise<Map<string, { imagePath: string; name: string }>> {
  const admin = createAdminClient();
  const uniq = [...new Set(petIds)].filter(Boolean);
  const out = new Map<string, { imagePath: string; name: string }>();
  if (uniq.length === 0) return out;
  const { data } = await admin
    .from("pets")
    .select("id, nickname, subline, personality, egg_types(sprite_prefix, name_th)")
    .in("id", uniq);
  for (const p of data ?? []) {
    const egg = (Array.isArray(p.egg_types) ? p.egg_types[0] : p.egg_types) as
      | { sprite_prefix: string; name_th: string }
      | null;
    const line = parsePetLine(p.subline);
    if (!egg || !line || !p.personality) continue;
    try {
      out.set(p.id, {
        imagePath: getPetImagePath(egg.sprite_prefix, 4, line as Subline, p.personality as Personality),
        name:
          p.nickname ??
          getSpeciesName(egg.sprite_prefix, 4, line, p.personality as Personality, egg.name_th),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

async function nameMap(userIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const uniq = [...new Set(userIds)].filter(Boolean);
  if (uniq.length === 0) return new Map();
  const { data } = await admin.from("profiles").select("id, username").in("id", uniq);
  return new Map((data ?? []).map((p) => [p.id, p.username ?? "เพื่อน"]));
}

function matchTurnHolder(m: {
  phase: string;
  attacker_id: string;
  player_a_id: string;
  player_b_id: string;
}): string {
  // phase='assigning' -> ผู้ส่ง (attacker) · phase='answering' -> ผู้ตอบ (อีกคน)
  if (m.phase === "assigning") return m.attacker_id;
  return m.attacker_id === m.player_a_id ? m.player_b_id : m.player_a_id;
}

export async function getPvpOverview(
  supabase: SupabaseServerClient,
  userId: string
): Promise<PvpOverview> {
  // housekeeping (คำท้าหมดอายุ 24 ชม. / แมตช์ถูกทิ้ง 3 วัน) — lazy ตรงนี้ ไม่ต้องรอ cron
  await supabase.rpc("pvp_gc");
  // เติมตั๋ว lazy (daily 2 + raid bonus) — จุดเดียวกับ pvp_gc, ไม่มี cron
  await supabase.rpc("pvp_grant_tickets");

  const [{ data: challenges }, { data: matches }, { count: ticketCount }] = await Promise.all([
    supabase
      .from("pvp_challenges")
      .select("*")
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("pvp_matches")
      .select("*")
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
      .order("last_action_at", { ascending: false }),
    supabase
      .from("pvp_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("consumed_at", null),
  ]);

  const chRows = challenges ?? [];
  const mRows = matches ?? [];

  const names = await nameMap([
    ...chRows.map((c) => (c.challenger_id === userId ? c.opponent_id : c.challenger_id)),
    ...mRows.map((m) => (m.player_a_id === userId ? m.player_b_id : m.player_a_id)),
  ]);

  // เสริมรูป Qmon ของผู้ท้า (สำหรับคำท้าเข้า)
  const incomingRows = chRows.filter((c) => c.opponent_id === userId && c.status === "pending");
  const petInfo = new Map<string, { speciesName: string; imagePath: string }>();
  if (incomingRows.length > 0) {
    const admin = createAdminClient();
    const { data: petRows } = await admin
      .from("pets")
      .select("id, subline, personality, egg_types(sprite_prefix, name_th)")
      .in(
        "id",
        incomingRows.map((c) => c.challenger_pet_id)
      );
    for (const p of petRows ?? []) {
      const egg = (Array.isArray(p.egg_types) ? p.egg_types[0] : p.egg_types) as
        | { sprite_prefix: string; name_th: string }
        | null;
      const line = parsePetLine(p.subline);
      if (!egg || !line || !p.personality) continue;
      try {
        petInfo.set(p.id, {
          speciesName: getSpeciesName(egg.sprite_prefix, 4, line, p.personality as Personality, egg.name_th),
          imagePath: getPetImagePath(egg.sprite_prefix, 4, line as Subline, p.personality as Personality),
        });
      } catch {
        /* skip */
      }
    }
  }

  const incoming: PvpIncomingChallenge[] = incomingRows.map((c) => ({
    id: c.id,
    challengerId: c.challenger_id,
    challengerName: names.get(c.challenger_id) ?? "เพื่อน",
    challengerPet: petInfo.get(c.challenger_pet_id) ?? null,
    createdAt: c.created_at,
    expiresAt: c.expires_at,
  }));

  const outgoing: PvpOutgoingChallenge[] = chRows
    .filter(
      (c) =>
        c.challenger_id === userId &&
        (c.status === "pending" || c.status === "declined")
    )
    .map((c) => ({
      id: c.id,
      opponentName: names.get(c.opponent_id) ?? "เพื่อน",
      status: c.status as "pending" | "declined",
      createdAt: c.created_at,
      expiresAt: c.expires_at,
    }));

  const toItem = (m: (typeof mRows)[number]): PvpMatchListItem => {
    const iAm: "a" | "b" = m.player_a_id === userId ? "a" : "b";
    const turnHolder = matchTurnHolder(m);
    const won =
      m.status === "finished" && m.outcome !== "draw"
        ? m.winner_id === userId
        : m.status === "finished" && m.outcome === "draw"
          ? null
          : null;
    return {
      id: m.id,
      opponentName: names.get(iAm === "a" ? m.player_b_id : m.player_a_id) ?? "เพื่อน",
      iAm,
      hpMine: iAm === "a" ? m.hp_a : m.hp_b,
      hpOpp: iAm === "a" ? m.hp_b : m.hp_a,
      currentRound: m.current_round,
      status: m.status,
      outcome: m.outcome,
      iWon: won,
      myTurn: m.status === "active" && turnHolder === userId,
      updatedAt: m.last_action_at,
    };
  };

  const active = mRows.filter((m) => m.status === "active").map(toItem);
  const finished = mRows
    .filter((m) => m.status === "finished" || m.status === "abandoned")
    .slice(0, 20)
    .map(toItem);

  return {
    yourTurn: active.filter((m) => m.myTurn),
    waiting: active.filter((m) => !m.myTurn),
    incoming,
    outgoing,
    finished,
    ticketBalance: ticketCount ?? 0,
  };
}

// ---- state สำหรับจอดวล / resume --------------------------------------------

export type PvpDuelQuestion = {
  questionId: number;
  questionText: string;
  choices: string[];
  imageUrl: string | null;
  difficulty: number;
  chapter: string;
  subject: string;
};

export type PvpMatchView = {
  matchId: string;
  status: "active" | "finished" | "abandoned";
  phase: "assigning" | "answering";
  currentRound: number;
  maxRounds: number;

  iAm: "a" | "b";
  meName: string;
  oppName: string;
  petMineImage: string | null;
  petMineName: string;
  petOppImage: string | null;
  petOppName: string;
  hpMine: number;
  hpMineMax: number;
  hpOpp: number;
  hpOppMax: number;
  statsMine: PvpPetStats;
  statsOpp: PvpPetStats;

  isAttacker: boolean; // ถึงตาเราส่งการ์ด
  isDefender: boolean; // ถึงตาเราตอบ
  myTurn: boolean;

  hand: PvpCard[]; // มือของเรา (เฉพาะตอน isAttacker && phase='assigning')
  activeCard: PvpCard | null; // การ์ดที่กำลังเล่น (phase='answering')
  activeQuestion: PvpDuelQuestion | null; // โจทย์ของ activeCard — ตัด correct_index ออก
  timerSeconds: number; // ความยาว timer เต็มของยกนี้ (คิด haste แล้ว)
  roundDeadline: string | null; // เส้นตายตอบจริงจาก server (ISO) — null เมื่อไม่ใช่ช่วง answering

  outcome: "a_win" | "b_win" | "draw" | null;
  iWon: boolean | null;

  // สไลซ์ 3: EXP ที่ "ตัวที่กำลังเลี้ยง" ของเราได้จากแมตช์นี้ (เฉพาะตอน finished) + pet id เพื่อ reconcile วิวัฒนาการ
  myExpAward: number | null;
  myExpPetId: string | null;
};

export async function getPvpMatchView(
  supabase: SupabaseServerClient,
  userId: string,
  matchId: string
): Promise<PvpMatchView | null> {
  // lazy: resolve ยกที่หมดเวลาตอบแล้ว (haste 30 วิ / timer ปกติ) ก่อนอ่านสถานะ
  await supabase.rpc("pvp_gc_round_timeouts");

  const { data: m } = await supabase.from("pvp_matches").select("*").eq("id", matchId).maybeSingle();
  if (!m) return null;
  if (m.player_a_id !== userId && m.player_b_id !== userId) return null;

  const iAm: "a" | "b" = m.player_a_id === userId ? "a" : "b";
  const statsMine = parsePvpStats(iAm === "a" ? m.stat_a : m.stat_b);
  const statsOpp = parsePvpStats(iAm === "a" ? m.stat_b : m.stat_a);
  const turnHolder = matchTurnHolder(m);
  const isAttacker = m.status === "active" && m.phase === "assigning" && turnHolder === userId;
  const isDefender = m.status === "active" && m.phase === "answering" && turnHolder === userId;

  const [names, sprites] = await Promise.all([
    nameMap([m.player_a_id, m.player_b_id]),
    petSpriteMap([m.pet_a_id, m.pet_b_id]),
  ]);
  const myPetId = iAm === "a" ? m.pet_a_id : m.pet_b_id;
  const oppPetId = iAm === "a" ? m.pet_b_id : m.pet_a_id;

  // มือของเรา (การ์ดที่ยังไม่เล่น) — RLS ยอมให้เห็นเฉพาะมือตัวเอง
  let hand: PvpCard[] = [];
  if (isAttacker) {
    const { data: cards } = await supabase
      .from("pvp_match_cards")
      .select("id, chapter, subject, difficulty, effect_id, question_id, hand_no")
      .eq("match_id", matchId)
      .eq("drawn_for_user_id", userId)
      .is("played_at", null)
      .order("created_at", { ascending: true });
    hand = (cards ?? []).map((c) => ({
      id: c.id,
      chapter: c.chapter,
      subject: c.subject,
      difficulty: c.difficulty,
      effect_id: c.effect_id,
      question_id: c.question_id,
    }));
  }

  // การ์ด + โจทย์ที่กำลังเล่น (phase='answering')
  let activeCard: PvpCard | null = null;
  let activeQuestion: PvpDuelQuestion | null = null;
  if (m.status === "active" && m.phase === "answering" && m.active_card_id) {
    const { data: c } = await supabase
      .from("pvp_match_cards")
      .select("id, chapter, subject, difficulty, effect_id, question_id")
      .eq("id", m.active_card_id)
      .maybeSingle();
    if (c) {
      activeCard = {
        id: c.id,
        chapter: c.chapter,
        subject: c.subject,
        difficulty: c.difficulty,
        effect_id: c.effect_id,
        question_id: c.question_id,
      };
      // อ่านโจทย์ผ่าน admin (questions RLS ล็อก) — ตัด correct_index/explanation ทิ้งก่อนส่ง client
      const admin = createAdminClient();
      const { data: q } = await admin
        .from("questions")
        .select("id, question_text, choices, image_url, difficulty, chapter, subject")
        .eq("id", c.question_id)
        .maybeSingle();
      if (q) {
        activeQuestion = {
          questionId: q.id,
          questionText: q.question_text,
          choices: (q.choices ?? []) as string[],
          imageUrl: q.image_url ?? null,
          difficulty: q.difficulty,
          chapter: q.chapter,
          subject: q.subject,
        };
      }
    }
  }

  const won =
    m.status === "finished" && m.outcome !== "draw" ? m.winner_id === userId : null;

  return {
    matchId: m.id,
    status: m.status,
    phase: m.phase,
    currentRound: m.current_round,
    maxRounds: 30,
    iAm,
    meName: names.get(userId) ?? "คุณ",
    oppName: names.get(iAm === "a" ? m.player_b_id : m.player_a_id) ?? "เพื่อน",
    petMineImage: sprites.get(myPetId)?.imagePath ?? null,
    petMineName: sprites.get(myPetId)?.name ?? "Qmon ของคุณ",
    petOppImage: sprites.get(oppPetId)?.imagePath ?? null,
    petOppName: sprites.get(oppPetId)?.name ?? "Qmon คู่ต่อสู้",
    hpMine: iAm === "a" ? m.hp_a : m.hp_b,
    hpMineMax: statsMine.hp || 1,
    hpOpp: iAm === "a" ? m.hp_b : m.hp_a,
    hpOppMax: statsOpp.hp || 1,
    statsMine,
    statsOpp,
    isAttacker,
    isDefender,
    myTurn: isAttacker || isDefender,
    hand,
    activeCard,
    activeQuestion,
    timerSeconds: pvpTimerSecondsForCard(statsMine, activeCard?.effect_id ?? null),
    roundDeadline: m.phase === "answering" ? (m.round_deadline ?? null) : null,
    outcome: m.outcome,
    iWon: won,
    myExpAward: m.status === "finished" ? (iAm === "a" ? m.exp_a : m.exp_b) ?? null : null,
    myExpPetId: m.status === "finished" ? (iAm === "a" ? m.exp_pet_a : m.exp_pet_b) ?? null : null,
  };
}
