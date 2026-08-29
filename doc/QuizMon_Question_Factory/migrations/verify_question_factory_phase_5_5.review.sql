-- Phase 5.5 full-flow production verification.
-- Review/run only as one transaction. The final ROLLBACK is mandatory.
-- storage.objects fixtures are transaction-local metadata used to exercise the
-- existing Storage guards; no bytes or product records survive this script.
begin;

do $$
declare
  v_run_key uuid := pg_catalog.gen_random_uuid();
  v_run_id bigint;
  v_slot_id bigint;
  v_question_id bigint;
  v_result jsonb;
  v_candidate_1 jsonb;
  v_candidate_2 jsonb;
  v_mapping jsonb;
  v_product jsonb;
  v_asset_1 text := 'sha256:' || pg_catalog.repeat('a', 64);
  v_asset_2 text := 'sha256:' || pg_catalog.repeat('b', 64);
  v_mapping_checksum text := 'sha256:' || pg_catalog.repeat('c', 64);
  v_staging_1 text;
  v_staging_2 text;
  v_public_path text;
  v_event_types text[];
begin
  v_candidate_1 := pg_catalog.jsonb_build_object(
    'schemaVersion','question-candidate/v1','revision',1,'questionText','E2E candidate revision 1',
    'choices',pg_catalog.jsonb_build_array('A','B','C','D'),'correctIndex',0,
    'explanation','E2E explanation revision 1','difficulty',2,'needsAsset',true
  );
  v_candidate_2 := pg_catalog.jsonb_build_object(
    'schemaVersion','question-candidate/v1','revision',2,'questionText','E2E candidate revision 2',
    'choices',pg_catalog.jsonb_build_array('A','B','C','D'),'correctIndex',1,
    'explanation','E2E explanation revision 2','difficulty',2,'needsAsset',true
  );

  v_result := public.question_factory_create_run(
    v_run_key, 'sha256:'||pg_catalog.repeat('1',64),
    'qf:v1|stage=lower_secondary|grade=7|subject=science|unit=e2e_dry_run', 'phase-5.5-smoke',
    'e2e-profile','v1','profile/v1','sha256:'||pg_catalog.repeat('2',64),'{}'::jsonb,
    'e2e-blueprint','v1','blueprint/v1','sha256:'||pg_catalog.repeat('3',64),'{}'::jsonb,
    1,1,1,4,2::smallint,3::smallint,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'slot_key','visual-001','ordinal',1,'slot_spec',pg_catalog.jsonb_build_object(
        'topic','e2e-topic','learningObjective','Verify the full Factory flow',
        'cognitiveDemand','application','questionArchetype','scenario',
        'representationType','diagram','difficulty',2
      )
    ))
  );
  if (v_result->>'replayed')::boolean then raise exception 'initial create-run replayed'; end if;
  v_run_id := (v_result->>'run_id')::bigint;
  select id into strict v_slot_id from public.question_factory_slots
  where run_id=v_run_id and slot_key='visual-001';

  v_result := public.question_factory_create_run(
    v_run_key, 'sha256:'||pg_catalog.repeat('1',64),
    'qf:v1|stage=lower_secondary|grade=7|subject=science|unit=e2e_dry_run', 'phase-5.5-smoke',
    'e2e-profile','v1','profile/v1','sha256:'||pg_catalog.repeat('2',64),'{}'::jsonb,
    'e2e-blueprint','v1','blueprint/v1','sha256:'||pg_catalog.repeat('3',64),'{}'::jsonb,
    1,1,1,4,2::smallint,3::smallint,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'slot_key','visual-001','ordinal',1,'slot_spec',pg_catalog.jsonb_build_object(
        'topic','e2e-topic','learningObjective','Verify the full Factory flow',
        'cognitiveDemand','application','questionArchetype','scenario',
        'representationType','diagram','difficulty',2
      )
    ))
  );
  if not (v_result->>'replayed')::boolean then raise exception 'create-run replay missing'; end if;

  v_result := public.question_factory_start_run(v_run_key,0,'e2e:start','phase-5.5-smoke');
  if v_result->>'status'<>'running' or (v_result->>'state_version')::bigint<>1 then raise exception 'start failed %',v_result; end if;
  v_result := public.question_factory_start_run(v_run_key,0,'e2e:start','phase-5.5-smoke');
  if not (v_result->>'replayed')::boolean then raise exception 'start replay missing'; end if;

  perform public.question_factory_transition_text_slot(v_run_key,'visual-001',0,'planned','authoring',
    'AUTHOR_STARTED','BLUEPRINT_SLOT_ASSIGNED','{}','e2e:author:start','phase-5.5-smoke');
  perform public.question_factory_transition_text_slot(v_run_key,'visual-001',1,'authoring','question_qc',
    'AUTHOR_COMPLETE','CANDIDATE_SCHEMA_VALID',pg_catalog.jsonb_build_object('candidate',v_candidate_1),
    'e2e:author:rev1','phase-5.5-smoke');
  v_result := public.question_factory_transition_text_slot(v_run_key,'visual-001',2,'question_qc','author_revision',
    'QUESTION_QC_REVISE','QC_REQUIRES_REVISION',
    '{"decision":{"decision":"REVISE","issues":[{"code":"clarity"}]}}','e2e:qc:revise','phase-5.5-smoke');
  if v_result->>'state'<>'author_revision' or (v_result->>'state_version')::bigint<>3 then raise exception 'QC revision failed'; end if;

  -- Reconnect checkpoint: state and latest factual event reconstruct the revision scene.
  if not exists(select 1 from public.question_factory_slots where id=v_slot_id and state='author_revision' and state_version=3 and author_revision=1)
     or (select event_type from public.question_factory_events where slot_id=v_slot_id order by id desc limit 1)<>'QUESTION_QC_REVISE' then
    raise exception 'revision reconnect checkpoint failed';
  end if;

  perform public.question_factory_transition_text_slot(v_run_key,'visual-001',3,'author_revision','question_qc',
    'QUESTION_REVISED','CANDIDATE_SCHEMA_VALID',pg_catalog.jsonb_build_object('candidate',v_candidate_2),
    'e2e:author:rev2','phase-5.5-smoke');
  perform public.question_factory_transition_text_slot(v_run_key,'visual-001',4,'question_qc','asset_build',
    'QUESTION_QC_PASS','TEXT_QC_PASS_ASSET_REQUIRED','{"decision":{"decision":"PASS","issues":[]}}',
    'e2e:qc:pass','phase-5.5-smoke');

  v_staging_1 := 'runs/'||v_run_key::text||'/slots/visual-001/rev-1.svg';
  insert into storage.objects(bucket_id,name,metadata)
  values('question-factory-assets',v_staging_1,'{"mimetype":"image/svg+xml","size":120}');
  perform public.question_factory_register_asset(v_run_key,'visual-001',5,1,'diagram',v_staging_1,
    'image/svg+xml',120,v_asset_1,600,400,'{"prompt":"first attempt"}',
    'e2e:asset:1','phase-5.5-smoke');
  v_result := public.question_factory_record_asset_qc(v_run_key,'visual-001',6,1,v_asset_1,'REGENERATE',
    '[{"code":"label_overlap"}]','e2e:asset-qc:regenerate','phase-5.5-smoke');
  if v_result->>'state'<>'asset_build' or (v_result->>'state_version')::bigint<>7 then raise exception 'asset recovery failed'; end if;

  -- Reconnect checkpoint: failed asset remains immutable and the Slot resumes asset_build.
  if not exists(select 1 from public.question_factory_assets where slot_id=v_slot_id and asset_revision=1 and state='qc_failed')
     or (select event_type from public.question_factory_events where slot_id=v_slot_id order by id desc limit 1)<>'ASSET_QC_REGENERATE' then
    raise exception 'asset reconnect checkpoint failed';
  end if;

  v_staging_2 := 'runs/'||v_run_key::text||'/slots/visual-001/rev-2.svg';
  insert into storage.objects(bucket_id,name,metadata)
  values('question-factory-assets',v_staging_2,'{"mimetype":"image/svg+xml","size":140}');
  perform public.question_factory_register_asset(v_run_key,'visual-001',7,2,'diagram',v_staging_2,
    'image/svg+xml',140,v_asset_2,600,400,'{"prompt":"corrected attempt"}',
    'e2e:asset:2','phase-5.5-smoke');
  v_result := public.question_factory_record_asset_qc(v_run_key,'visual-001',8,2,v_asset_2,'PASS','[]',
    'e2e:asset-qc:pass','phase-5.5-smoke');
  if v_result->>'state'<>'pending_human_review' or (v_result->>'state_version')::bigint<>9 then raise exception 'asset QC pass failed'; end if;

  v_product := pg_catalog.jsonb_build_object(
    'grade_band','junior','subject','science','branch',null,'category','วิทยาศาสตร์',
    'grade_level','ม.1','chapter','E2E dry run','difficulty',2,
    'question_text','E2E candidate revision 2','choices',pg_catalog.jsonb_build_array('A','B','C','D'),
    'correct_index',1,'explanation','E2E explanation revision 2','status','draft',
    'image_url',null,'image_prompt',null,'image_filename',null,'image_type',null
  );
  v_mapping := pg_catalog.jsonb_build_object(
    'schemaVersion','question-product-candidate/v1','mappingVersion','question-product-mapping/v1',
    'mappingEntryId','e2e-entry','curriculumChapterKey','e2e_dry_run',
    'curriculumChapterChecksum','sha256:'||pg_catalog.repeat('d',64),'questionRevision',2,
    'productRow',v_product,'approvedAsset',pg_catalog.jsonb_build_object(
      'assetRevision',2,'checksum',v_asset_2,'mimeType','image/svg+xml',
      'buildSpec',pg_catalog.jsonb_build_object('prompt','corrected attempt')
    ),'checksum',v_mapping_checksum
  );
  v_result := public.question_factory_record_human_review(v_run_key,'visual-001',9,2,v_mapping_checksum,
    2,v_asset_2,'APPROVE',null,'[]',pg_catalog.jsonb_build_object('product_mapping_candidate',v_mapping),
    'phase-5.5-reviewer','e2e:human:approve');
  if v_result->>'state'<>'approved' or (v_result->>'state_version')::bigint<>10 then raise exception 'human approval failed'; end if;
  v_result := public.question_factory_record_human_review(v_run_key,'visual-001',9,2,v_mapping_checksum,
    2,v_asset_2,'APPROVE',null,'[]',pg_catalog.jsonb_build_object('product_mapping_candidate',v_mapping),
    'phase-5.5-reviewer','e2e:human:approve');
  if not (v_result->>'replayed')::boolean then raise exception 'human approval replay missing'; end if;

  v_result := public.question_factory_publish_draft(v_run_key,'visual-001',10,v_mapping,v_mapping_checksum,
    'phase-5.5-smoke','e2e:draft');
  v_question_id := (v_result->>'question_id')::bigint;
  if (v_result->>'replayed')::boolean or not exists(select 1 from public.questions where id=v_question_id and status='draft') then
    raise exception 'draft publication failed %',v_result;
  end if;
  v_result := public.question_factory_publish_draft(v_run_key,'visual-001',10,v_mapping,v_mapping_checksum,
    'phase-5.5-smoke','e2e:draft:retry');
  if not (v_result->>'replayed')::boolean or (v_result->>'question_id')::bigint<>v_question_id then raise exception 'draft replay missing'; end if;

  v_public_path := 'q'||v_question_id::text||'.svg';
  insert into storage.objects(bucket_id,name,metadata)
  values('question-images',v_public_path,'{"mimetype":"image/svg+xml","size":140}');
  v_result := public.question_factory_promote_asset(v_run_key,'visual-001',11,v_question_id,2,v_asset_2,
    v_public_path,'https://wmndxiuqzrnqbhrznmfg.supabase.co/storage/v1/object/public/question-images/'||v_public_path,
    'phase-5.5-smoke','e2e:promote');
  if (v_result->>'replayed')::boolean or (v_result->>'state_version')::bigint<>12 then raise exception 'promotion failed'; end if;
  v_result := public.question_factory_promote_asset(v_run_key,'visual-001',11,v_question_id,2,v_asset_2,
    v_public_path,'https://wmndxiuqzrnqbhrznmfg.supabase.co/storage/v1/object/public/question-images/'||v_public_path,
    'phase-5.5-smoke','e2e:promote');
  if not (v_result->>'replayed')::boolean then raise exception 'promotion replay missing'; end if;

  -- Reconnect checkpoint immediately before learner-visible activation.
  if not exists(select 1 from public.question_factory_slots where id=v_slot_id and state='approved' and state_version=12 and question_id=v_question_id)
     or not exists(select 1 from public.questions where id=v_question_id and status='draft' and image_filename=v_public_path)
     or (select event_type from public.question_factory_events where slot_id=v_slot_id order by id desc limit 1)<>'ASSET_PROMOTED' then
    raise exception 'pre-activation reconnect checkpoint failed';
  end if;

  v_result := public.question_factory_activate_draft(v_run_key,'visual-001',12,v_question_id,v_mapping_checksum,
    'phase-5.5-reviewer','e2e:activate');
  if (v_result->>'replayed')::boolean or v_result->>'state'<>'active'
     or (v_result->>'state_version')::bigint<>13 or (v_result->>'active_count')::integer<>1 then
    raise exception 'activation failed %',v_result;
  end if;
  v_result := public.question_factory_activate_draft(v_run_key,'visual-001',12,v_question_id,v_mapping_checksum,
    'phase-5.5-reviewer','e2e:activate');
  if not (v_result->>'replayed')::boolean then raise exception 'activation replay missing'; end if;

  select pg_catalog.array_agg(event_type order by id) into v_event_types
  from public.question_factory_events where slot_id=v_slot_id;
  if v_event_types <> array[
    'SLOT_PLANNED','AUTHOR_STARTED','AUTHOR_COMPLETE','QUESTION_QC_REVISE','QUESTION_REVISED',
    'QUESTION_QC_PASS','ASSET_CREATED','ASSET_QC_REGENERATE','ASSET_CREATED','ASSET_QC_PASS',
    'HUMAN_APPROVED','PRODUCT_DRAFT_CREATED','ASSET_PROMOTED','QUESTION_ACTIVATED'
  ]::text[] then raise exception 'unexpected factual event sequence: %',v_event_types; end if;
  if (select count(*) from public.questions where id=v_question_id and status='active')<>1
     or (select count(*) from public.question_factory_product_mappings where slot_id=v_slot_id and question_id=v_question_id)<>1
     or (select count(*) from public.question_factory_assets where slot_id=v_slot_id)<>2 then
    raise exception 'final product/ledger invariants failed';
  end if;
end
$$;

rollback;
