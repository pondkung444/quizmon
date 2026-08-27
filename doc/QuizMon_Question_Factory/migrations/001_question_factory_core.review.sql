-- REVIEW DRAFT ONLY — DO NOT APPLY IN PHASE 4.4
-- QuizMon Question Factory v1 core schema.
-- Final migration file must be created with `supabase migration new` in Phase 4.5.

begin;

-- Fail closed if a previous/partial Factory schema exists. A migration must never
-- silently adopt unknown tables with matching names.
do $$
declare
  v_existing text[];
begin
  select array_agg(c.relname order by c.relname)
    into v_existing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname = any (array[
      'question_factory_runs',
      'question_factory_slots',
      'question_factory_events',
      'question_factory_reviews',
      'question_factory_assets',
      'question_factory_profile_snapshots',
      'question_factory_blueprint_snapshots',
      'question_factory_product_mappings'
    ]);

  if v_existing is not null then
    raise exception 'Question Factory migration precondition failed; existing tables: %', v_existing;
  end if;
end
$$;

create table public.question_factory_profile_snapshots (
  id bigint generated always as identity primary key,
  profile_id text not null,
  profile_version text not null,
  schema_version text not null,
  checksum text not null,
  resolved_profile jsonb not null,
  created_at timestamptz not null default now(),
  constraint question_factory_profile_snapshots_profile_id_nonempty
    check (btrim(profile_id) <> ''),
  constraint question_factory_profile_snapshots_profile_version_nonempty
    check (btrim(profile_version) <> ''),
  constraint question_factory_profile_snapshots_schema_version_nonempty
    check (btrim(schema_version) <> ''),
  constraint question_factory_profile_snapshots_checksum_nonempty
    check (btrim(checksum) <> ''),
  constraint question_factory_profile_snapshots_resolved_profile_object
    check (jsonb_typeof(resolved_profile) = 'object'),
  constraint question_factory_profile_snapshots_identity_unique
    unique (profile_id, profile_version, checksum)
);

create table public.question_factory_blueprint_snapshots (
  id bigint generated always as identity primary key,
  blueprint_id text not null,
  blueprint_version text not null,
  schema_version text not null,
  profile_snapshot_id bigint not null,
  checksum text not null,
  resolved_blueprint jsonb not null,
  created_at timestamptz not null default now(),
  constraint question_factory_blueprint_snapshots_profile_fkey
    foreign key (profile_snapshot_id)
    references public.question_factory_profile_snapshots(id)
    on delete restrict,
  constraint question_factory_blueprint_snapshots_blueprint_id_nonempty
    check (btrim(blueprint_id) <> ''),
  constraint question_factory_blueprint_snapshots_blueprint_version_nonempty
    check (btrim(blueprint_version) <> ''),
  constraint question_factory_blueprint_snapshots_schema_version_nonempty
    check (btrim(schema_version) <> ''),
  constraint question_factory_blueprint_snapshots_checksum_nonempty
    check (btrim(checksum) <> ''),
  constraint question_factory_blueprint_snapshots_resolved_blueprint_object
    check (jsonb_typeof(resolved_blueprint) = 'object'),
  constraint question_factory_blueprint_snapshots_identity_unique
    unique (blueprint_id, blueprint_version, checksum),
  constraint question_factory_blueprint_snapshots_run_reference_unique
    unique (id, profile_snapshot_id)
);

create index question_factory_blueprint_snapshots_profile_idx
  on public.question_factory_blueprint_snapshots (profile_snapshot_id);

create table public.question_factory_runs (
  id bigint generated always as identity primary key,
  run_key uuid not null default gen_random_uuid(),
  scope_key text not null,
  status text not null default 'created',
  profile_snapshot_id bigint not null,
  blueprint_snapshot_id bigint not null,
  target_active integer not null,
  preferred_batch_size integer not null default 10,
  max_batch_size integer not null default 20,
  max_generated_items integer not null default 120,
  max_revisions_per_slot smallint not null default 2,
  max_technical_retries smallint not null default 3,
  active_count integer not null default 0,
  pipeline_ready_count integer not null default 0,
  coverage_summary jsonb not null default '{}'::jsonb,
  last_error jsonb,
  state_version bigint not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint question_factory_runs_run_key_unique unique (run_key),
  constraint question_factory_runs_profile_fkey
    foreign key (profile_snapshot_id)
    references public.question_factory_profile_snapshots(id)
    on delete restrict,
  constraint question_factory_runs_blueprint_fkey
    foreign key (blueprint_snapshot_id, profile_snapshot_id)
    references public.question_factory_blueprint_snapshots(id, profile_snapshot_id)
    on delete restrict,
  constraint question_factory_runs_scope_key_nonempty check (btrim(scope_key) <> ''),
  constraint question_factory_runs_created_by_nonempty check (btrim(created_by) <> ''),
  constraint question_factory_runs_status_check check (status = any (array[
    'created'::text,
    'running'::text,
    'paused'::text,
    'waiting_human_review'::text,
    'completed'::text,
    'cancelled'::text,
    'failed'::text
  ])),
  constraint question_factory_runs_target_active_positive check (target_active > 0),
  constraint question_factory_runs_batch_sizes_valid check (
    preferred_batch_size > 0
    and max_batch_size >= preferred_batch_size
  ),
  constraint question_factory_runs_limits_valid check (
    max_generated_items >= target_active
    and max_revisions_per_slot >= 0
    and max_technical_retries >= 0
  ),
  constraint question_factory_runs_counts_nonnegative check (
    active_count >= 0 and pipeline_ready_count >= 0
  ),
  constraint question_factory_runs_state_version_nonnegative check (state_version >= 0),
  constraint question_factory_runs_coverage_summary_object
    check (jsonb_typeof(coverage_summary) = 'object'),
  constraint question_factory_runs_last_error_object
    check (last_error is null or jsonb_typeof(last_error) = 'object'),
  constraint question_factory_runs_timestamps_valid check (
    updated_at >= created_at
    and (started_at is null or started_at >= created_at)
    and (completed_at is null or completed_at >= created_at)
  ),
  constraint question_factory_runs_completed_state_valid check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create unique index question_factory_runs_one_open_scope_idx
  on public.question_factory_runs (scope_key)
  where status in ('created', 'running', 'paused', 'waiting_human_review');

create index question_factory_runs_status_updated_idx
  on public.question_factory_runs (status, updated_at, id);

create index question_factory_runs_profile_idx
  on public.question_factory_runs (profile_snapshot_id);

create index question_factory_runs_blueprint_profile_idx
  on public.question_factory_runs (blueprint_snapshot_id, profile_snapshot_id);

create table public.question_factory_slots (
  id bigint generated always as identity primary key,
  run_id bigint not null,
  slot_key text not null,
  ordinal integer not null,
  state text not null default 'planned',
  slot_spec jsonb not null,
  author_revision smallint not null default 0,
  technical_retry_count smallint not null default 0,
  question_id bigint,
  replacement_count smallint not null default 0,
  state_version bigint not null default 0,
  blocked_reason jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_factory_slots_run_fkey
    foreign key (run_id)
    references public.question_factory_runs(id)
    on delete restrict,
  constraint question_factory_slots_question_fkey
    foreign key (question_id)
    references public.questions(id)
    on delete restrict,
  constraint question_factory_slots_run_key_unique unique (run_id, slot_key),
  constraint question_factory_slots_run_ordinal_unique unique (run_id, ordinal),
  constraint question_factory_slots_run_reference_unique unique (id, run_id),
  constraint question_factory_slots_slot_key_nonempty check (btrim(slot_key) <> ''),
  constraint question_factory_slots_ordinal_positive check (ordinal > 0),
  constraint question_factory_slots_state_check check (state = any (array[
    'planned'::text,
    'authoring'::text,
    'question_qc'::text,
    'author_revision'::text,
    'asset_build'::text,
    'asset_qc'::text,
    'pending_human_review'::text,
    'approved'::text,
    'active'::text,
    'rejected'::text,
    'blocked'::text,
    'cancelled'::text
  ])),
  constraint question_factory_slots_slot_spec_object
    check (jsonb_typeof(slot_spec) = 'object'),
  constraint question_factory_slots_counters_nonnegative check (
    author_revision >= 0
    and technical_retry_count >= 0
    and replacement_count >= 0
    and state_version >= 0
  ),
  constraint question_factory_slots_blocked_reason_object
    check (blocked_reason is null or jsonb_typeof(blocked_reason) = 'object'),
  constraint question_factory_slots_blocked_reason_required check (
    state <> 'blocked' or blocked_reason is not null
  ),
  constraint question_factory_slots_updated_at_valid check (updated_at >= created_at)
);

create index question_factory_slots_run_state_ordinal_idx
  on public.question_factory_slots (run_id, state, ordinal);

create index question_factory_slots_question_idx
  on public.question_factory_slots (question_id)
  where question_id is not null;

create table public.question_factory_events (
  id bigint generated always as identity primary key,
  run_id bigint not null,
  slot_id bigint,
  event_type text not null,
  from_state text,
  to_state text,
  reason_code text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_type text not null,
  actor_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint question_factory_events_run_fkey
    foreign key (run_id)
    references public.question_factory_runs(id)
    on delete restrict,
  constraint question_factory_events_slot_fkey
    foreign key (slot_id, run_id)
    references public.question_factory_slots(id, run_id)
    on delete restrict,
  constraint question_factory_events_idempotency_unique unique (idempotency_key),
  constraint question_factory_events_event_type_nonempty check (btrim(event_type) <> ''),
  constraint question_factory_events_reason_code_nonempty check (btrim(reason_code) <> ''),
  constraint question_factory_events_idempotency_nonempty check (btrim(idempotency_key) <> ''),
  constraint question_factory_events_actor_type_check check (actor_type = any (array[
    'system'::text,
    'worker'::text,
    'reviewer'::text,
    'human'::text,
    'reconciler'::text
  ])),
  constraint question_factory_events_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create index question_factory_events_run_created_idx
  on public.question_factory_events (run_id, created_at, id);

create index question_factory_events_slot_created_idx
  on public.question_factory_events (slot_id, created_at, id)
  where slot_id is not null;

create table public.question_factory_reviews (
  id bigint generated always as identity primary key,
  run_id bigint not null,
  slot_id bigint not null,
  review_kind text not null,
  subject_revision integer not null,
  decision text not null,
  issues jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  reviewer_type text not null,
  reviewer_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint question_factory_reviews_run_fkey
    foreign key (run_id)
    references public.question_factory_runs(id)
    on delete restrict,
  constraint question_factory_reviews_slot_fkey
    foreign key (slot_id, run_id)
    references public.question_factory_slots(id, run_id)
    on delete restrict,
  constraint question_factory_reviews_idempotency_unique unique (idempotency_key),
  constraint question_factory_reviews_kind_check check (review_kind = any (array[
    'question_qc'::text,
    'asset_qc'::text,
    'human'::text
  ])),
  constraint question_factory_reviews_decision_check check (decision = any (array[
    'pass'::text,
    'revise'::text,
    'reject'::text,
    'regenerate'::text,
    'reject_asset'::text,
    'approve'::text,
    'request_revision'::text
  ])),
  constraint question_factory_reviews_kind_decision_check check (
    (review_kind = 'question_qc' and decision in ('pass', 'revise', 'reject'))
    or (review_kind = 'asset_qc' and decision in ('pass', 'regenerate', 'reject_asset'))
    or (review_kind = 'human' and decision in ('approve', 'request_revision', 'reject'))
  ),
  constraint question_factory_reviews_subject_revision_nonnegative
    check (subject_revision >= 0),
  constraint question_factory_reviews_issues_array
    check (jsonb_typeof(issues) = 'array'),
  constraint question_factory_reviews_evidence_object
    check (jsonb_typeof(evidence) = 'object'),
  constraint question_factory_reviews_reviewer_type_check check (reviewer_type = any (array[
    'model'::text,
    'rule_engine'::text,
    'human'::text
  ])),
  constraint question_factory_reviews_idempotency_nonempty
    check (btrim(idempotency_key) <> '')
);

create index question_factory_reviews_run_slot_created_idx
  on public.question_factory_reviews (run_id, slot_id, created_at, id);

create index question_factory_reviews_slot_kind_revision_idx
  on public.question_factory_reviews (slot_id, review_kind, subject_revision, created_at);

create table public.question_factory_assets (
  id bigint generated always as identity primary key,
  run_id bigint not null,
  slot_id bigint not null,
  asset_revision integer not null,
  state text not null default 'built',
  representation_type text not null,
  staging_bucket text not null,
  staging_path text not null,
  public_bucket text,
  public_path text,
  mime_type text not null,
  byte_size bigint not null,
  checksum text not null,
  width integer,
  height integer,
  build_spec jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_factory_assets_run_fkey
    foreign key (run_id)
    references public.question_factory_runs(id)
    on delete restrict,
  constraint question_factory_assets_slot_fkey
    foreign key (slot_id, run_id)
    references public.question_factory_slots(id, run_id)
    on delete restrict,
  constraint question_factory_assets_slot_revision_unique
    unique (slot_id, asset_revision),
  constraint question_factory_assets_state_check check (state = any (array[
    'built'::text,
    'qc_passed'::text,
    'qc_failed'::text,
    'promoted'::text,
    'superseded'::text
  ])),
  constraint question_factory_assets_revision_nonnegative check (asset_revision >= 0),
  constraint question_factory_assets_representation_nonempty
    check (btrim(representation_type) <> ''),
  constraint question_factory_assets_staging_bucket_nonempty
    check (staging_bucket = 'question-factory-assets'),
  constraint question_factory_assets_staging_path_nonempty
    check (btrim(staging_path) <> ''),
  constraint question_factory_assets_mime_check
    check (mime_type = any (array['image/svg+xml'::text, 'image/webp'::text])),
  constraint question_factory_assets_byte_size_positive check (byte_size > 0),
  constraint question_factory_assets_checksum_nonempty check (btrim(checksum) <> ''),
  constraint question_factory_assets_dimensions_valid check (
    (width is null and height is null)
    or (width > 0 and height > 0)
  ),
  constraint question_factory_assets_build_spec_object
    check (jsonb_typeof(build_spec) = 'object'),
  constraint question_factory_assets_promotion_tuple check (
    (public_bucket is null and public_path is null)
    or (public_bucket is not null and btrim(public_bucket) <> ''
        and public_path is not null and btrim(public_path) <> '')
  ),
  constraint question_factory_assets_promoted_has_public_path check (
    state <> 'promoted' or public_path is not null
  ),
  constraint question_factory_assets_updated_at_valid check (updated_at >= created_at)
);

create index question_factory_assets_run_slot_idx
  on public.question_factory_assets (run_id, slot_id, asset_revision desc);

create index question_factory_assets_state_updated_idx
  on public.question_factory_assets (state, updated_at, id);

create table public.question_factory_product_mappings (
  id bigint generated always as identity primary key,
  run_id bigint not null,
  slot_id bigint not null,
  question_id bigint not null,
  mapping_version text not null,
  mapping_input jsonb not null,
  mapping_output jsonb not null,
  checksum text not null,
  created_at timestamptz not null default now(),
  constraint question_factory_product_mappings_run_fkey
    foreign key (run_id)
    references public.question_factory_runs(id)
    on delete restrict,
  constraint question_factory_product_mappings_slot_fkey
    foreign key (slot_id, run_id)
    references public.question_factory_slots(id, run_id)
    on delete restrict,
  constraint question_factory_product_mappings_question_fkey
    foreign key (question_id)
    references public.questions(id)
    on delete restrict,
  constraint question_factory_product_mappings_slot_unique unique (slot_id),
  constraint question_factory_product_mappings_question_unique unique (question_id),
  constraint question_factory_product_mappings_version_nonempty
    check (btrim(mapping_version) <> ''),
  constraint question_factory_product_mappings_input_object
    check (jsonb_typeof(mapping_input) = 'object'),
  constraint question_factory_product_mappings_output_object
    check (jsonb_typeof(mapping_output) = 'object'),
  constraint question_factory_product_mappings_checksum_nonempty
    check (btrim(checksum) <> '')
);

create index question_factory_product_mappings_run_idx
  on public.question_factory_product_mappings (run_id, created_at, id);

-- RLS defense-in-depth for all exposed Factory tables.
alter table public.question_factory_profile_snapshots enable row level security;
alter table public.question_factory_blueprint_snapshots enable row level security;
alter table public.question_factory_runs enable row level security;
alter table public.question_factory_slots enable row level security;
alter table public.question_factory_events enable row level security;
alter table public.question_factory_reviews enable row level security;
alter table public.question_factory_assets enable row level security;
alter table public.question_factory_product_mappings enable row level security;

-- Remove automatically broad Data API grants. No anon/authenticated policies are
-- created; these tables are server-only in v1.
revoke all on table public.question_factory_profile_snapshots from public, anon, authenticated, service_role;
revoke all on table public.question_factory_blueprint_snapshots from public, anon, authenticated, service_role;
revoke all on table public.question_factory_runs from public, anon, authenticated, service_role;
revoke all on table public.question_factory_slots from public, anon, authenticated, service_role;
revoke all on table public.question_factory_events from public, anon, authenticated, service_role;
revoke all on table public.question_factory_reviews from public, anon, authenticated, service_role;
revoke all on table public.question_factory_assets from public, anon, authenticated, service_role;
revoke all on table public.question_factory_product_mappings from public, anon, authenticated, service_role;

-- Least-privilege service grants. Snapshots/events/reviews/mappings are immutable
-- ledgers; runs/slots/assets contain current state and may be updated.
grant select, insert on table
  public.question_factory_profile_snapshots,
  public.question_factory_blueprint_snapshots,
  public.question_factory_events,
  public.question_factory_reviews,
  public.question_factory_product_mappings
to service_role;

grant select, insert, update on table
  public.question_factory_runs,
  public.question_factory_slots,
  public.question_factory_assets
to service_role;

revoke all on sequence
  public.question_factory_profile_snapshots_id_seq,
  public.question_factory_blueprint_snapshots_id_seq,
  public.question_factory_runs_id_seq,
  public.question_factory_slots_id_seq,
  public.question_factory_events_id_seq,
  public.question_factory_reviews_id_seq,
  public.question_factory_assets_id_seq,
  public.question_factory_product_mappings_id_seq
from public, anon, authenticated, service_role;

grant usage, select on sequence
  public.question_factory_profile_snapshots_id_seq,
  public.question_factory_blueprint_snapshots_id_seq,
  public.question_factory_runs_id_seq,
  public.question_factory_slots_id_seq,
  public.question_factory_events_id_seq,
  public.question_factory_reviews_id_seq,
  public.question_factory_assets_id_seq,
  public.question_factory_product_mappings_id_seq
to service_role;

comment on table public.question_factory_runs is
  'Question Factory run current state. Server/service only.';
comment on table public.question_factory_slots is
  'Atomic blueprint production slots. Server/service only.';
comment on table public.question_factory_events is
  'Append-only Question Factory transition/event ledger.';
comment on table public.question_factory_reviews is
  'Immutable Question/Asset/Human review judgments and evidence.';
comment on table public.question_factory_assets is
  'Question Factory asset revisions and promotion state.';
comment on table public.question_factory_profile_snapshots is
  'Immutable resolved curriculum/profile snapshots.';
comment on table public.question_factory_blueprint_snapshots is
  'Immutable resolved/frozen blueprint snapshots.';
comment on table public.question_factory_product_mappings is
  'Immutable Factory-to-product mapping snapshots.';

commit;
