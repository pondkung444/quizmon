create table public.raid_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id),
  raid_type_id uuid not null references public.raid_types(id),
  ticket_id uuid not null references public.raid_tickets(id),
  stat_snapshot jsonb not null,
  caps_snapshot jsonb not null,
  threshold_pct numeric not null,
  gauge_max int not null,
  phase text not null default 'choosing',
  current_step_index int not null default 0,
  gauge_earned int not null default 0,
  fail_count int not null default 0,
  boss_correct_count int not null default 0,
  outcome text,
  gear_item_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress'
);

create unique index raid_runs_one_active_per_user
  on public.raid_runs (user_id) where status = 'in_progress';

create table public.raid_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.raid_runs(id) on delete cascade,
  step_index int not null,
  option_a_obstacle_id uuid not null references public.raid_obstacles(id),
  option_a_color text not null check (option_a_color in ('green','yellow','red')),
  option_b_obstacle_id uuid not null references public.raid_obstacles(id),
  option_b_color text not null check (option_b_color in ('green','yellow','red')),
  chosen_side text check (chosen_side in ('a','b')),
  chosen_at timestamptz,
  roll_threshold numeric,
  roll_value numeric,
  roll_passed boolean,
  quiz_question_id bigint references public.questions(id),
  quiz_pulled_at timestamptz,
  quiz_correct boolean,
  resolved_at timestamptz,
  unique (run_id, step_index)
);

create table public.raid_boss_questions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.raid_runs(id) on delete cascade,
  seq int not null,
  question_id bigint not null references public.questions(id),
  pulled_at timestamptz not null default now(),
  answered_at timestamptz,
  is_correct boolean,
  unique (run_id, seq)
);

alter table public.raid_tickets
  add constraint raid_tickets_consumed_run_id_fkey
  foreign key (consumed_run_id) references public.raid_runs(id);

alter table public.raid_runs enable row level security;
alter table public.raid_run_steps enable row level security;
alter table public.raid_boss_questions enable row level security;

create policy "raid_runs: select own" on public.raid_runs for select using (auth.uid() = user_id);
create policy "raid_run_steps: select own" on public.raid_run_steps for select using (
  exists (select 1 from public.raid_runs r where r.id = raid_run_steps.run_id and r.user_id = auth.uid())
);
create policy "raid_boss_questions: select own" on public.raid_boss_questions for select using (
  exists (select 1 from public.raid_runs r where r.id = raid_boss_questions.run_id and r.user_id = auth.uid())
);
