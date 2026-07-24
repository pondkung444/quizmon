-- Migration: 021_add_food_system
-- version: 20260718225509 (ตรงกับ supabase_migrations.schema_migrations ใน production)
--
-- ไฟล์นี้ backfill เข้า repo โดยดึง statements คำต่อคำจาก
-- supabase_migrations.schema_migrations ผ่าน Supabase MCP (execute_sql) ไม่ใช่
-- เขียนใหม่จาก schema introspection — เพื่อให้ repo ตรงกับสิ่งที่ apply จริงใน
-- production 100% รวมถึงส่วนที่แก้ claim_daily_mission_bonus ซึ่งเป็นคนละไฟล์กับ
-- 021_daily_missions.sql เดิม (คนละ migration, คนละรอบ)
--
-- ตั้งชื่อไฟล์ด้วย version timestamp (ไม่ใช่เลข 021/022 sequential) ตั้งใจ เพราะ
-- history จริงพิสูจน์แล้วว่ามีชื่อชนกัน (021_add_food_system กับ 021_weekly_leaderboard
-- คนละอันแต่ใช้เลข 021 เหมือนกัน) — ใช้ version กันชนซ้ำในอนาคต

-- 1. คลังอาหารของผู้เล่น (ผูก user_id ไม่ผูก pet — ใช้กับตัวไหนก็ได้ตอนป้อน)
create table public.player_food (
  user_id uuid not null references auth.users(id),
  food_type text not null check (food_type in ('A','B')),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, food_type)
);
alter table public.player_food enable row level security;
create policy "select own food" on public.player_food
  for select using (auth.uid() = user_id);

-- 2. event log ทุกครั้งที่ป้อนอาหาร — ที่มาของทั้ง personality tally (ตอนนี้) และ Bond streak (อนาคต)
create table public.pet_feedings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  pet_id uuid not null references public.pets(id),
  food_type text not null check (food_type in ('A','B')),
  fed_date date not null,
  created_at timestamptz not null default now()
);
comment on column public.pet_feedings.fed_date is 'วันที่ Bangkok คำนวณฝั่ง app (getTodayInBangkok()) — ห้ามใช้ current_date ของ DB (UTC) ตามกฎเดิมของโปรเจกต์';
alter table public.pet_feedings enable row level security;
create policy "select own feedings" on public.pet_feedings
  for select using (auth.uid() = user_id);
create index idx_pet_feedings_pet_date on public.pet_feedings (pet_id, fed_date);

-- 3. RPC ป้อนอาหาร — atomic หัก quantity + insert event, กันติดลบ กันป้อนสัตว์คนอื่น
create or replace function public.feed_pet(p_pet_id uuid, p_food_type text, p_fed_date date)
returns table(quantity_remaining integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_qty integer;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_food_type not in ('A','B') then
    raise exception 'food_type ไม่ถูกต้อง';
  end if;
  if not exists (select 1 from public.pets where id = p_pet_id and user_id = v_user_id) then
    raise exception 'ไม่พบสัตว์เลี้ยงตัวนี้ของผู้ใช้';
  end if;

  update public.player_food
  set quantity = quantity - 1, updated_at = now()
  where user_id = v_user_id and food_type = p_food_type and quantity >= 1
  returning quantity into v_new_qty;

  if not found then
    raise exception 'อาหารไม่พอ';
  end if;

  insert into public.pet_feedings (user_id, pet_id, food_type, fed_date)
  values (v_user_id, p_pet_id, p_food_type, p_fed_date);

  return query select v_new_qty;
end;
$$;

-- 4. แก้ RPC เดิม claim_daily_mission_bonus — เติม p_food_type (default null = backward-compatible
--    กับโค้ดเก่าที่ยังไม่ส่งพารามิเตอร์นี้ระหว่าง deploy) ไม่แตะ logic EXP เดิมแม้แต่บรรทัดเดียว
create or replace function public.claim_daily_mission_bonus(p_mission_id uuid, p_food_type text default null)
returns table(awarded boolean, bonus_exp smallint, no_active_pet boolean, food_credited boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_pet_id uuid;
  v_bonus_exp smallint;
  v_rows int;
  v_food_credited boolean := false;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if p_food_type is not null and p_food_type not in ('A','B') then
    raise exception 'food_type ไม่ถูกต้อง';
  end if;

  select id into v_pet_id
  from public.pets
  where user_id = v_user_id and is_active = true
  limit 1;

  if v_pet_id is null then
    return query select false, null::smallint, true, false;
    return;
  end if;

  update public.daily_missions
  set bonus_awarded_at = now()
  where id = p_mission_id
    and user_id = v_user_id
    and bonus_awarded_at is null
  returning daily_missions.bonus_exp into v_bonus_exp;

  if not found then
    return query select false, null::smallint, false, false;
    return;
  end if;

  update public.pets
  set exp = exp + v_bonus_exp
  where id = v_pet_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'claim_daily_mission_bonus: pet % หายไประหว่างเคลมโบนัส (mission %)', v_pet_id, p_mission_id;
  end if;

  if p_food_type is not null then
    insert into public.player_food (user_id, food_type, quantity)
    values (v_user_id, p_food_type, 1)
    on conflict (user_id, food_type)
    do update set quantity = player_food.quantity + 1, updated_at = now();
    v_food_credited := true;
  end if;

  return query select true, v_bonus_exp, false, v_food_credited;
end;
$function$;
