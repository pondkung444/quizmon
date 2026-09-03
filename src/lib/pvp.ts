import { redirect } from "next/navigation";
import { getUser, type createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName, parsePetLine } from "@/lib/petLine";
import type { Personality, Subline } from "@/lib/evolution";
import { parsePvpStats, type PvpCard, type PvpPetStats } from "@/lib/pvp/stats";
import { pvpTimerSeconds } from "@/lib/pvp/combat";

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

  const pets: PvpPetPick[] = [];
  for (const row of data ?? []) {
    const egg = (Array.isArray(row.egg_types) ? row.egg_types[0] : row.egg_types) as
      | { sprite_prefix: string; name_th: string }
      | null;
    const line = parsePetLine(row.subline);
    if (!egg || !line || !row.personality) continue;
    try {
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
        stats: parsePvpStats({
          hp: row.stat_hp,
          atk: row.stat_atk,
          def: row.stat_def,
          spd: row.stat_spd,
          foc: row.stat_foc,
        }),
      });
    } catch {
      // pet ข้อมูลไม่ครบ (เช่น sprite mapping ล้ม) — ข้าม
    }
  }
  return pets;
}

export type ChallengeableFriend = {
  userId: string;
  username: string;
  gradeBand: string;
};

// เพื่อนที่ประลองได้ = เพื่อนที่ยืนยันแล้ว + grade_band เดียวกับเรา (ไม่ null)
export async function getChallengeableFriends(userId: string): Promise<ChallengeableFriend[]> {
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("grade_band").eq("id", userId).maybeSingle();
  const myBand = me?.grade_band ?? null;
  if (!myBand) return [];

  const { data: rows } = await admin
    .from("friendships")
    .select("user_id_low, user_id_high")
    .or(`user_id_low.eq.${userId},user_id_high.eq.${userId}`);

  const friendIds = (rows ?? []).map((r) =>
    r.user_id_low === userId ? r.user_id_high : r.user_id_low
  );
  if (friendIds.length === 0) return [];

  const { data: profs } = await admin
    .from("profiles")
    .select("id, username, grade_band")
    .in("id", friendIds)
    .eq("grade_band", myBand);

  return (profs ?? []).map((p) => ({
    userId: p.id,
    username: p.username ?? "เพื่อน",
    gradeBand: p.grade_band as string,
  }));
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
};

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

  const [{ data: challenges }, { data: matches }] = await Promise.all([
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
  timerSeconds: number; // display เท่านั้น (สไลซ์ 1)

  outcome: "a_win" | "b_win" | "draw" | null;
  iWon: boolean | null;
};

export async function getPvpMatchView(
  supabase: SupabaseServerClient,
  userId: string,
  matchId: string
): Promise<PvpMatchView | null> {
  const { data: m } = await supabase.from("pvp_matches").select("*").eq("id", matchId).maybeSingle();
  if (!m) return null;
  if (m.player_a_id !== userId && m.player_b_id !== userId) return null;

  const iAm: "a" | "b" = m.player_a_id === userId ? "a" : "b";
  const statsMine = parsePvpStats(iAm === "a" ? m.stat_a : m.stat_b);
  const statsOpp = parsePvpStats(iAm === "a" ? m.stat_b : m.stat_a);
  const turnHolder = matchTurnHolder(m);
  const isAttacker = m.status === "active" && m.phase === "assigning" && turnHolder === userId;
  const isDefender = m.status === "active" && m.phase === "answering" && turnHolder === userId;

  const names = await nameMap([m.player_a_id, m.player_b_id]);

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
        .select("id, question_text, choices, image_url, difficulty, chapter")
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
    timerSeconds: pvpTimerSeconds(statsMine),
    outcome: m.outcome,
    iWon: won,
  };
}
