alter table public.quiz_attempts drop constraint quiz_attempts_source_check;
alter table public.quiz_attempts add constraint quiz_attempts_source_check
  check (source is null or source in ('dungeon_bonus','raid_obstacle','raid_boss'));
alter table public.quiz_attempts add column raid_run_id uuid references public.raid_runs(id);
