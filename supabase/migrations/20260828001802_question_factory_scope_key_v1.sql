-- Lock Question Factory v1 run scopes to one canonical learner-content unit.
alter table public.question_factory_runs
  drop constraint question_factory_runs_scope_key_nonempty;

alter table public.question_factory_runs
  add constraint question_factory_runs_scope_key_v1_format
  check (
    char_length(scope_key) <= 255
    and char_length(split_part(scope_key, '|unit=', 2)) between 1 and 64
    and (
      scope_key ~ '^qf:v1\|stage=lower_secondary\|grade=(7|8|9)\|subject=(math|science)\|unit=[a-z0-9]+(_[a-z0-9]+)*$'
      or scope_key ~ '^qf:v1\|stage=upper_secondary\|grade=(10|11|12)\|subject=(physics|chemistry|biology)\|unit=[a-z0-9]+(_[a-z0-9]+)*$'
    )
  );
