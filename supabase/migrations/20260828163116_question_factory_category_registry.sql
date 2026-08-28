begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.question_factory_category_registry (
  id bigint generated always as identity primary key,
  mapping_id text not null,
  mapping_version text not null,
  chapter_key text not null,
  topic_id text not null,
  education_stage text not null,
  factory_subject text not null,
  grade_band text not null,
  product_subject text not null,
  branch text,
  product_category text not null,
  evidence_source text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint question_factory_category_registry_chapter_fkey
    foreign key (chapter_key) references public.curriculum_chapters(chapter_key) on delete restrict,
  constraint question_factory_category_registry_mapping_id_unique unique (mapping_id),
  constraint question_factory_category_registry_identity_unique
    unique (mapping_version, chapter_key, topic_id),
  constraint question_factory_category_registry_mapping_id_format
    check (mapping_id ~ '^pcm_[0-9a-f]{24}$'),
  constraint question_factory_category_registry_topic_id_format
    check (topic_id ~ '^pt_[0-9a-f]{24}$'),
  constraint question_factory_category_registry_version_check
    check (mapping_version = 'question-product-mapping/v1'),
  constraint question_factory_category_registry_stage_check
    check (education_stage in ('lower_secondary', 'upper_secondary')),
  constraint question_factory_category_registry_factory_subject_check
    check (factory_subject in ('math', 'science', 'physics', 'chemistry', 'biology')),
  constraint question_factory_category_registry_grade_band_check
    check (grade_band in ('junior', 'senior')),
  constraint question_factory_category_registry_product_subject_check
    check (product_subject in ('math', 'science')),
  constraint question_factory_category_registry_branch_check
    check (branch is null or branch in ('physics', 'chemistry', 'biology')),
  constraint question_factory_category_registry_route_check check (
    (education_stage = 'lower_secondary' and grade_band = 'junior'
      and factory_subject = product_subject and branch is null)
    or
    (education_stage = 'upper_secondary' and grade_band = 'senior'
      and factory_subject = branch
      and ((branch = 'physics' and product_subject = 'math')
        or (branch in ('chemistry', 'biology') and product_subject = 'science')))
  ),
  constraint question_factory_category_registry_labels_nonempty check (
    pg_catalog.btrim(product_category) <> '' and pg_catalog.btrim(evidence_source) <> ''
  )
);

create index question_factory_category_registry_resolve_idx
  on public.question_factory_category_registry
  (mapping_version, chapter_key, topic_id, education_stage, factory_subject);

alter table public.question_factory_category_registry enable row level security;

revoke all on table public.question_factory_category_registry
  from public, anon, authenticated, service_role;
revoke all on sequence public.question_factory_category_registry_id_seq
  from public, anon, authenticated, service_role;
grant select, insert on table public.question_factory_category_registry to service_role;
grant usage, select on sequence public.question_factory_category_registry_id_seq to service_role;

do $$
declare
  v_exact_questions integer;
  v_exact_pairs integer;
begin
  select count(*), count(distinct (c.chapter_key, q.category))
  into v_exact_questions, v_exact_pairs
  from public.curriculum_chapters c
  join public.questions q
    on q.grade_band = c.grade_band
   and q.grade_level is not distinct from c.grade_level
   and q.subject = c.subject
   and q.branch is not distinct from c.branch
   and q.chapter is not distinct from c.chapter;

  if v_exact_questions <> 3512 or v_exact_pairs <> 85 then
    raise exception 'category registry seed precondition failed: expected 3512 exact questions / 85 chapter-category pairs, found % / %',
      v_exact_questions, v_exact_pairs;
  end if;
end
$$;

insert into public.question_factory_category_registry (
  mapping_id, mapping_version, chapter_key, topic_id, education_stage,
  factory_subject, grade_band, product_subject, branch, product_category,
  evidence_source
)
select distinct
  'pcm_' || pg_catalog.substr(encode(digest(
    'question-product-mapping/v1|' || c.chapter_key || '|' || q.category,
    'sha256'
  ), 'hex'), 1, 24),
  'question-product-mapping/v1',
  c.chapter_key,
  'pt_' || pg_catalog.substr(encode(digest(
    c.grade_band || '|' || c.subject || '|' || coalesce(c.branch, '<null>') || '|' || q.category,
    'sha256'
  ), 'hex'), 1, 24),
  case when c.grade_band = 'junior' then 'lower_secondary' else 'upper_secondary' end,
  case when c.grade_band = 'junior' then c.subject else c.branch end,
  c.grade_band,
  c.subject,
  c.branch,
  q.category,
  'production-question-exact-chapter-match-2026-08-28'
from public.curriculum_chapters c
join public.questions q
  on q.grade_band = c.grade_band
 and q.grade_level is not distinct from c.grade_level
 and q.subject = c.subject
 and q.branch is not distinct from c.branch
 and q.chapter is not distinct from c.chapter;

do $$
begin
  if (select count(*) from public.question_factory_category_registry) <> 85 then
    raise exception 'category registry seed failed to create exactly 85 approved mappings';
  end if;
end
$$;

comment on table public.question_factory_category_registry is
  'Immutable service-only v1 mapping authority from Factory chapter/topic identities to exact QuizMon product category strings.';
comment on column public.question_factory_category_registry.topic_id is
  'Stable opaque Factory topic identity. Profiles and Blueprint Slots must copy this value exactly.';
comment on column public.question_factory_category_registry.evidence_source is
  'Provenance for the approved exact product category mapping; never runtime inference.';

commit;
