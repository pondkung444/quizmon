do $migration$
declare
  r record;
  v_def text;
  v_hits integer;
begin
  for r in
    select * from (values
      ('public.create_open_pvp_challenge(uuid)'::regprocedure,
        $$not in ('junior', 'senior')$$,   $$not in ('primary', 'junior', 'senior')$$),
      ('public.accept_open_pvp_challenge(uuid, uuid)'::regprocedure,
        $$not in ('junior', 'senior')$$,   $$not in ('primary', 'junior', 'senior')$$),
      ('public.list_open_pvp_challenges()'::regprocedure,
        $$viewer.grade_band in ('junior', 'senior')$$, $$viewer.grade_band in ('primary', 'junior', 'senior')$$),
      ('public.prepare_raid_card_question(uuid, uuid, integer, text)'::regprocedure,
        $$not in ('junior','senior')$$,    $$not in ('primary','junior','senior')$$),
      ('public.start_raid_chapter_run(uuid, uuid)'::regprocedure,
        $$not in ('junior','senior')$$,    $$not in ('primary','junior','senior')$$)
    ) as t(fn, v_old, v_new)
  loop
    v_def := pg_get_functiondef(r.fn);
    if position(r.v_new in v_def) > 0 then
      raise notice '% already accepts primary — skipped', r.fn;
      continue;
    end if;
    v_hits := (length(v_def) - length(replace(v_def, r.v_old, ''))) / length(r.v_old);
    if v_hits <> 1 then
      raise exception '%: expected exactly 1 occurrence, found %', r.fn, v_hits;
    end if;
    execute replace(v_def, r.v_old, r.v_new);
  end loop;
end
$migration$;