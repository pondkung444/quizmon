import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BASE_EXP_PER_CORRECT,
  DAILY_EXP_CAP,
  calculateExpForAnswer,
  getAccuracyMultiplier,
  getComboMultiplier,
  getTodayInBangkok,
} from "@/lib/exp";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type JourneyDay = {
  date: string; // YYYY-MM-DD Bangkok
  expEarned: number; // capped ที่ 180
  petId: string | null;
  stage: number | null; // 1-4, null ถ้ายังไม่มี pet เลย
  subline: string | null;
  personality: string | null;
  eggTypeId: string | null;
  // sprite_prefix ของ egg_type_id นี้ — เพิ่มเข้ามานอกสเปก type เดิม เพราะ getPetImagePath()
  // (src/lib/petImage.ts) ต้องใช้ sprite_prefix ไม่ใช่ egg_type_id ตรงๆ ให้ component เรียกจากตรงนี้
  // ได้เลยไม่ต้อง join เพิ่มฝั่ง UI
  spritePrefix: string | null;
  didEvolveThisDay: boolean;
  didCollectThisDay: boolean;
  isFuture: boolean;
  isToday: boolean;
};

type Attempt = { pet_id: string | null; is_correct: boolean; created_at: string };
type JourneyEvent = {
  event_name: string;
  pet_id: string | null;
  props: Record<string, unknown>;
  client_ts: string;
};
type PetRow = {
  id: string;
  egg_type_id: string;
  subline: string | null;
  personality: string | null;
  hatched_at: string;
};

// จ-อา ของสัปดาห์นี้ตามเวลา Asia/Bangkok — anchor เป็น UTC midnight ของวันปฏิทิน (ไม่ใช่เวลาจริง)
// เพื่อทำเลขวันที่ล้วนๆ ปลอดภัย แล้วค่อยแปลงกลับเป็นขอบเขต UTC จริงตอน query (bangkokMidnightUtcIso)
function getBangkokWeekDates(): string[] {
  const todayStr = getTodayInBangkok();
  const anchor = new Date(`${todayStr}T00:00:00Z`);
  const mondayOffset = (anchor.getUTCDay() + 6) % 7; // getUTCDay: 0=Sun..6=Sat -> 0=Mon..6=Sun
  const monday = new Date(anchor);
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// เที่ยงคืนของวันที่ dateStr (ตามปฏิทิน Bangkok) แปลงเป็น instant จริงในรูป UTC ISO —
// ใช้ offset +07:00 ตรงๆ ได้เพราะ Asia/Bangkok ไม่มี DST
function bangkokMidnightUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+07:00`).toISOString();
}

function nextDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// state (active pet_id, stage) หลังเกิด event นี้ — ใช้ทั้งตอนหา baseline (event ล่าสุด
// ก่อนสัปดาห์นี้) และตอนเดินไปข้างหน้าทีละวัน (เรียงตาม client_ts จริงเสมอ ไม่ hardcode ลำดับ
// event_name เพราะวันเดียวอาจมีทั้ง collect ของตัวเก่ากับ hatch ของตัวใหม่)
function nextStateFromEvent(event: JourneyEvent): { petId: string | null; stage: number } {
  if (event.event_name === "stage_up") {
    return { petId: event.pet_id, stage: Number(event.props.to_stage) };
  }
  if (event.event_name === "hatch") {
    return { petId: event.pet_id, stage: 1 };
  }
  return { petId: event.pet_id, stage: Number(event.props.final_stage ?? 4) };
}

// replay สูตร exp เดิม (src/lib/exp.ts, ไม่แก้ไฟล์นั้น) ทีละข้อ "ต่อวัน" ตามลำดับ created_at —
// state (combo streak / sliding window ความแม่นยำ) เริ่มใหม่ทุกวัน ไม่ carry ข้ามวัน และใช้
// base=10 เสมอ
function replayExpForDay(dayAttempts: Attempt[]): number {
  let comboStreak = 0;
  let lastPetId: string | null = null;
  let total = 0;

  for (let i = 0; i < dayAttempts.length; i++) {
    const attempt = dayAttempts[i];
    if (attempt.pet_id !== lastPetId) {
      comboStreak = 0;
      lastPetId = attempt.pet_id;
    }
    comboStreak = attempt.is_correct ? comboStreak + 1 : 0;

    const last20 = dayAttempts.slice(Math.max(0, i - 20), i).map((a) => ({ is_correct: a.is_correct }));
    const accuracyMultiplier = getAccuracyMultiplier(last20);
    const comboMultiplier = getComboMultiplier(comboStreak);
    total += calculateExpForAnswer(attempt.is_correct, accuracyMultiplier, comboMultiplier, BASE_EXP_PER_CORRECT);
  }

  return Math.min(total, DAILY_EXP_CAP);
}

export async function getWeeklyJourney(supabase: SupabaseServerClient, userId: string): Promise<JourneyDay[]> {
  const weekDates = getBangkokWeekDates();
  const weekStartIso = bangkokMidnightUtcIso(weekDates[0]);
  const weekEndIso = bangkokMidnightUtcIso(nextDateStr(weekDates[6]));
  const todayStr = getTodayInBangkok();

  // analytics_events ไม่มี select policy ให้ user-session client เลย (ตั้งใจ — ดูคอมเมนต์ใน
  // supabase/migrations/014_analytics_events.sql) อ่านได้เฉพาะผ่าน service role เท่านั้น จึงต้อง
  // ใช้ createAdminClient() เฉพาะ query นี้จุดเดียว และต้อง .eq("user_id", userId) เองเสมอ เพราะ
  // ไม่มี RLS ช่วยกรองให้แล้ว (ต่างจาก quiz_attempts/pets/egg_types ที่ยังใช้ client เดิมได้ปกติ)
  const adminSupabase = createAdminClient();

  const [{ data: attemptRows }, { data: eventRows }, { data: petRows }, { data: eggTypeRows }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("pet_id, is_correct, created_at")
      .eq("user_id", userId)
      .gte("created_at", weekStartIso)
      .lt("created_at", weekEndIso)
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("analytics_events")
      .select("event_name, pet_id, props, client_ts")
      .eq("user_id", userId)
      .in("event_name", ["stage_up", "collect", "hatch"])
      .lt("client_ts", weekEndIso)
      .order("client_ts", { ascending: true }),
    supabase
      .from("pets")
      .select("id, egg_type_id, subline, personality, hatched_at")
      .eq("user_id", userId)
      .order("hatched_at", { ascending: true }),
    supabase.from("egg_types").select("id, sprite_prefix"),
  ]);

  const attempts = (attemptRows ?? []) as Attempt[];
  const events = (eventRows ?? []) as JourneyEvent[];
  const pets = (petRows ?? []) as PetRow[];

  const petsById = new Map(pets.map((p) => [p.id, p]));
  const spritePrefixByEggTypeId = new Map((eggTypeRows ?? []).map((e) => [e.id as string, e.sprite_prefix as string]));

  const attemptsByDay = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const day = getTodayInBangkok(new Date(attempt.created_at));
    const bucket = attemptsByDay.get(day) ?? [];
    bucket.push(attempt);
    attemptsByDay.set(day, bucket);
  }

  // เทียบเป็น Date.getTime() ไม่เทียบ string ตรงๆ — client_ts จาก DB มา format "+00:00"
  // แต่ weekStartIso มาจาก .toISOString() format "Z" ความยาว suffix ต่างกัน เทียบ string ตรงๆ
  // จะผิดพลาดได้ที่ขอบเขต millisecond เป๊ะๆ (เคสหายากแต่เกิดได้จริง)
  const weekStartMs = new Date(weekStartIso).getTime();
  const eventsBeforeWeek = events.filter((e) => new Date(e.client_ts).getTime() < weekStartMs);
  const eventsThisWeek = events.filter((e) => new Date(e.client_ts).getTime() >= weekStartMs);

  const eventsByDay = new Map<string, JourneyEvent[]>();
  for (const event of eventsThisWeek) {
    const day = getTodayInBangkok(new Date(event.client_ts));
    const bucket = eventsByDay.get(day) ?? [];
    bucket.push(event);
    eventsByDay.set(day, bucket);
  }

  // baseline: state ก่อนวันจันทร์ของสัปดาห์นี้ — จาก event ล่าสุดก่อนหน้า หรือ pet แรกที่ hatch
  // ถ้าไม่มี event มาก่อนเลย (user ใหม่มาก)
  let state: { petId: string | null; stage: number | null };
  const baseline = eventsBeforeWeek.at(-1);
  if (baseline) {
    state = nextStateFromEvent(baseline);
  } else if (pets.length > 0) {
    state = { petId: pets[0].id, stage: 1 };
  } else {
    state = { petId: null, stage: null };
  }

  const days: JourneyDay[] = [];
  for (const date of weekDates) {
    const isFuture = date > todayStr;
    const isToday = date === todayStr;

    if (isFuture) {
      days.push({
        date,
        expEarned: 0,
        petId: null,
        stage: null,
        subline: null,
        personality: null,
        eggTypeId: null,
        spritePrefix: null,
        didEvolveThisDay: false,
        didCollectThisDay: false,
        isFuture: true,
        isToday: false,
      });
      continue;
    }

    const dayEvents = eventsByDay.get(date) ?? [];
    const didEvolveThisDay = dayEvents.some((e) => e.event_name === "stage_up");
    const didCollectThisDay = dayEvents.some((e) => e.event_name === "collect");

    for (const event of dayEvents) {
      state = nextStateFromEvent(event);
    }

    const expEarned = replayExpForDay(attemptsByDay.get(date) ?? []);
    const pet = state.petId ? petsById.get(state.petId) ?? null : null;
    const stage = state.stage;

    days.push({
      date,
      expEarned,
      petId: state.petId,
      stage,
      subline: pet && stage !== null && stage >= 3 ? pet.subline : null,
      personality: pet && stage !== null && stage >= 4 ? pet.personality : null,
      eggTypeId: pet?.egg_type_id ?? null,
      spritePrefix: pet ? spritePrefixByEggTypeId.get(pet.egg_type_id) ?? null : null,
      didEvolveThisDay,
      didCollectThisDay,
      isFuture: false,
      isToday,
    });
  }

  return days;
}
