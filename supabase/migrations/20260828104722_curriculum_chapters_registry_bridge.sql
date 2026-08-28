-- Adopt curriculum_chapters as the canonical, read-public/write-service
-- curriculum registry used by Question Factory snapshots and product mapping.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Fail closed when production no longer matches the audited 95-row registry.
do $$
declare
  v_rows integer;
  v_write_policies integer;
begin
  if to_regclass('public.curriculum_chapters') is null then
    raise exception 'curriculum_chapters registry bridge precondition failed: table is missing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'curriculum_chapters'
      and column_name = 'chapter_key'
  ) then
    raise exception 'curriculum_chapters registry bridge precondition failed: chapter_key already exists';
  end if;

  select count(*) into v_rows from public.curriculum_chapters;
  if v_rows <> 95 then
    raise exception 'curriculum_chapters registry bridge precondition failed: expected 95 rows, found %', v_rows;
  end if;

  if exists (
    select 1
    from public.curriculum_chapters
    where grade_band not in ('junior', 'senior')
      or subject not in ('math', 'science')
      or (branch is not null and branch not in ('physics', 'chemistry', 'biology'))
      or grade_order < 0
      or chapter_order < 0
      or btrim(subject_label) = ''
      or btrim(chapter) = ''
  ) then
    raise exception 'curriculum_chapters registry bridge precondition failed: invalid domain row';
  end if;

  if exists (
    select 1
    from public.curriculum_chapters
    group by grade_band, grade_level, subject, branch, chapter
    having count(*) > 1
  ) then
    raise exception 'curriculum_chapters registry bridge precondition failed: null-safe natural-key duplicates exist';
  end if;

  select count(*) into v_write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'curriculum_chapters'
    and cmd <> 'SELECT';

  if v_write_policies <> 0 then
    raise exception 'curriculum_chapters registry bridge precondition failed: unexpected client write policies exist';
  end if;
end
$$;

alter table public.curriculum_chapters
  add column chapter_key text;

update public.curriculum_chapters
set chapter_key = 'cc_' || substr(
  encode(
    digest(
      grade_band || '|' || coalesce(grade_level, '<null>') || '|' ||
      subject || '|' || coalesce(branch, '<null>') || '|' || chapter,
      'sha256'
    ),
    'hex'
  ),
  1,
  24
);

do $$
begin
  if exists (
    select 1
    from public.curriculum_chapters
    where chapter_key is null
      or chapter_key !~ '^cc_[0-9a-f]{24}$'
  ) then
    raise exception 'curriculum_chapters registry bridge failed: invalid generated chapter_key';
  end if;

  if (select count(*) from public.curriculum_chapters) <>
     (select count(distinct chapter_key) from public.curriculum_chapters) then
    raise exception 'curriculum_chapters registry bridge failed: generated chapter_key collision';
  end if;
end
$$;

alter table public.curriculum_chapters
  alter column chapter_key set not null,
  add constraint curriculum_chapters_chapter_key_format
    check (chapter_key ~ '^cc_[0-9a-f]{24}$'),
  add constraint curriculum_chapters_chapter_key_unique
    unique (chapter_key),
  add constraint curriculum_chapters_grade_band_check
    check (grade_band in ('junior', 'senior')),
  add constraint curriculum_chapters_grade_level_check
    check (grade_level is null or grade_level in ('ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6')),
  add constraint curriculum_chapters_subject_check
    check (subject in ('math', 'science')),
  add constraint curriculum_chapters_branch_check
    check (branch is null or branch in ('physics', 'chemistry', 'biology')),
  add constraint curriculum_chapters_route_check
    check (
      (grade_band = 'junior' and subject in ('math', 'science') and branch is null)
      or
      (grade_band = 'senior' and (
        (subject = 'math' and branch = 'physics')
        or (subject = 'science' and branch in ('chemistry', 'biology'))
      ))
    ),
  add constraint curriculum_chapters_orders_nonnegative
    check (grade_order >= 0 and chapter_order >= 0),
  add constraint curriculum_chapters_labels_nonempty
    check (btrim(subject_label) <> '' and btrim(chapter) <> '');

alter table public.curriculum_chapters
  drop constraint curriculum_chapters_unique;

alter table public.curriculum_chapters
  add constraint curriculum_chapters_natural_key_unique
  unique nulls not distinct (grade_band, grade_level, subject, branch, chapter);

drop index public.idx_curriculum_chapters_lookup;

create index curriculum_chapters_browse_idx
  on public.curriculum_chapters
  (grade_band, grade_level, subject, branch, chapter_order, id);

-- RLS already permits SELECT to anon/authenticated and has no client write
-- policy. Revoke unused table privileges as defense in depth.
revoke insert, update, delete, truncate, references, trigger
  on table public.curriculum_chapters
  from anon, authenticated;

revoke all
  on sequence public.curriculum_chapters_id_seq
  from anon, authenticated;

comment on table public.curriculum_chapters is
  'Canonical QuizMon curriculum chapter registry. Public read, trusted service maintenance.';

comment on column public.curriculum_chapters.chapter_key is
  'Immutable cross-environment Factory unit identity. cc_ plus 24 lowercase SHA-256 hex characters.';

commit;
