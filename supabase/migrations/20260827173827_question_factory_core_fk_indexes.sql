-- Cover composite (slot_id, run_id) foreign keys in worker/audit tables.
create index question_factory_events_slot_run_idx
  on public.question_factory_events (slot_id, run_id);

create index question_factory_reviews_slot_run_idx
  on public.question_factory_reviews (slot_id, run_id);

create index question_factory_assets_slot_run_idx
  on public.question_factory_assets (slot_id, run_id);

create index question_factory_product_mappings_slot_run_idx
  on public.question_factory_product_mappings (slot_id, run_id);


