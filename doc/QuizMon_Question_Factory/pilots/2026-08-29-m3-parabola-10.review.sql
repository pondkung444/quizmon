-- Phase 5.6 controlled pilot: Mathematics M.3, parabola, 10 text-only items.
-- This script intentionally stops at pending_human_review. It does not create
-- product questions, publish drafts, promote assets, or activate learner data.
begin;

do $$
declare
  v_run_key uuid := '7caadaf2-b08b-4d3e-a5f1-4cf424cd11cc';
  v_scope_key text := 'qf:v1|stage=lower_secondary|grade=9|subject=math|unit=cc_6ec94863a615f997c2e8666a';
  v_profile jsonb;
  v_blueprint jsonb;
  v_items jsonb;
  v_slots jsonb;
  v_item jsonb;
  v_result jsonb;
  v_run_id bigint;
  v_profile_checksum text;
  v_blueprint_checksum text;
  v_request_checksum text;
begin
  v_items := $items$
  [
    {
      "slot_key":"parabola-001","ordinal":1,
      "slot_spec":{"learningObjective":"ระบุทิศทางการเปิดของกราฟฟังก์ชันกำลังสองจากเครื่องหมายของสัมประสิทธิ์ x²","topic":"pt_e6f0415e84bbcec343022119","difficulty":1,"cognitiveDemand":"understand","questionArchetype":"coefficient_interpretation","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"กราฟของฟังก์ชัน y = -3x² + 2x + 1 มีลักษณะอย่างไร","choices":["พาราโบลาหงาย เพราะสัมประสิทธิ์ของ x² เป็นบวก","พาราโบลาคว่ำ เพราะสัมประสิทธิ์ของ x² เป็นลบ","พาราโบลาหงาย เพราะสัมประสิทธิ์ของ x เป็นบวก","เป็นเส้นตรง เพราะมีพจน์ 2x"],"correctIndex":1,"explanation":"สัมประสิทธิ์ของ x² คือ -3 ซึ่งเป็นลบ กราฟของฟังก์ชันกำลังสองจึงเป็นพาราโบลาคว่ำ","answerType":"single_choice","learningObjective":"ระบุทิศทางการเปิดของกราฟฟังก์ชันกำลังสองจากเครื่องหมายของสัมประสิทธิ์ x²","topic":"pt_e6f0415e84bbcec343022119","difficulty":1,"cognitiveDemand":"understand","questionArchetype":"coefficient_interpretation","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"พิจารณาเครื่องหมายของสัมประสิทธิ์ a ใน y=ax²+bx+c","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-002","ordinal":2,
      "slot_spec":{"learningObjective":"หาจุดยอดของพาราโบลาจากสมการรูปจุดยอด","topic":"pt_e6f0415e84bbcec343022119","difficulty":1,"cognitiveDemand":"apply","questionArchetype":"vertex_form_reading","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"พาราโบลา y = -2(x + 1)² + 5 มีจุดยอดอยู่ที่พิกัดใด","choices":["(-1, 5)","(1, 5)","(-1, -5)","(2, 5)"],"correctIndex":0,"explanation":"สมการรูปจุดยอดคือ y = a(x-h)²+k โดย x+1 = x-(-1) จึงได้ h=-1 และ k=5 ดังนั้นจุดยอดคือ (-1, 5)","answerType":"single_choice","learningObjective":"หาจุดยอดของพาราโบลาจากสมการรูปจุดยอด","topic":"pt_e6f0415e84bbcec343022119","difficulty":1,"cognitiveDemand":"apply","questionArchetype":"vertex_form_reading","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"เทียบสมการกับ y=a(x-h)²+k แล้วอ่านค่า (h,k)","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-003","ordinal":3,
      "slot_spec":{"learningObjective":"หาจุดตัดแกน y ของกราฟฟังก์ชันกำลังสอง","topic":"pt_e6f0415e84bbcec343022119","difficulty":1,"cognitiveDemand":"apply","questionArchetype":"y_intercept","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"กราฟ y = 2x² - 5x - 3 ตัดแกน y ที่จุดใด","choices":["(0, -3)","(-3, 0)","(0, 2)","(0, -5)"],"correctIndex":0,"explanation":"จุดบนแกน y มี x=0 เมื่อแทนค่าได้ y=2(0)²-5(0)-3=-3 ดังนั้นจุดตัดแกน y คือ (0, -3)","answerType":"single_choice","learningObjective":"หาจุดตัดแกน y ของกราฟฟังก์ชันกำลังสอง","topic":"pt_e6f0415e84bbcec343022119","difficulty":1,"cognitiveDemand":"apply","questionArchetype":"y_intercept","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"แทน x=0 เพื่อหาจุดตัดแกน y","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-004","ordinal":4,
      "slot_spec":{"learningObjective":"หาแกนสมมาตรของพาราโบลาจากสมการรูปทั่วไป","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"apply","questionArchetype":"axis_of_symmetry","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"แกนสมมาตรของกราฟ y = 3x² + 12x + 7 คือเส้นตรงใด","choices":["x = -4","x = -2","x = 2","x = 4"],"correctIndex":1,"explanation":"สำหรับ y=ax²+bx+c แกนสมมาตรคือ x=-b/(2a) เมื่อ a=3 และ b=12 จึงได้ x=-12/(2×3)=-2","answerType":"single_choice","learningObjective":"หาแกนสมมาตรของพาราโบลาจากสมการรูปทั่วไป","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"apply","questionArchetype":"axis_of_symmetry","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"ใช้สูตร x=-b/(2a)","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-005","ordinal":5,
      "slot_spec":{"learningObjective":"หาจุดตัดแกน x ของกราฟฟังก์ชันกำลังสองด้วยการแยกตัวประกอบ","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"apply","questionArchetype":"x_intercepts","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"กราฟ y = x² + 2x - 8 ตัดแกน x ที่จุดใดบ้าง","choices":["(-4, 0) และ (2, 0)","(-2, 0) และ (4, 0)","(-4, 0) และ (-2, 0)","(2, 0) และ (4, 0)"],"correctIndex":0,"explanation":"ให้ y=0 จะได้ x²+2x-8=(x+4)(x-2)=0 ดังนั้น x=-4 หรือ x=2 จุดตัดแกน x คือ (-4,0) และ (2,0)","answerType":"single_choice","learningObjective":"หาจุดตัดแกน x ของกราฟฟังก์ชันกำลังสองด้วยการแยกตัวประกอบ","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"apply","questionArchetype":"x_intercepts","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"กำหนด y=0 แยกตัวประกอบ แล้วหาค่า x","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-006","ordinal":6,
      "slot_spec":{"learningObjective":"เขียนสมการฟังก์ชันกำลังสองให้อยู่ในรูปจุดยอดด้วยการทำกำลังสองสมบูรณ์","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"analyze","questionArchetype":"complete_the_square","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"สมการ y = x² - 6x + 11 เขียนในรูปจุดยอดได้ตรงกับข้อใด","choices":["y = (x - 3)² + 2","y = (x + 3)² + 2","y = (x - 3)² - 2","y = (x - 6)² + 11"],"correctIndex":0,"explanation":"x²-6x+11 = (x²-6x+9)+2 = (x-3)²+2 จึงได้ y=(x-3)²+2","answerType":"single_choice","learningObjective":"เขียนสมการฟังก์ชันกำลังสองให้อยู่ในรูปจุดยอดด้วยการทำกำลังสองสมบูรณ์","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"analyze","questionArchetype":"complete_the_square","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"เติมและหักกำลังสองของครึ่งหนึ่งของสัมประสิทธิ์ x","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-007","ordinal":7,
      "slot_spec":{"learningObjective":"เปรียบเทียบความกว้างและทิศทางของพาราโบลาจากสมการรูปจุดยอด","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"analyze","questionArchetype":"graph_comparison","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"เมื่อเทียบกับกราฟ y = x² ข้อใดอธิบายกราฟ y = -4x² ได้ถูกต้อง","choices":["หงายและกว้างกว่า","หงายและแคบกว่า","คว่ำและกว้างกว่า","คว่ำและแคบกว่า"],"correctIndex":3,"explanation":"เครื่องหมายลบทำให้กราฟคว่ำ และ |a|=4 มากกว่า 1 ทำให้กราฟแคบกว่ากราฟ y=x²","answerType":"single_choice","learningObjective":"เปรียบเทียบความกว้างและทิศทางของพาราโบลาจากสมการรูปจุดยอด","topic":"pt_e6f0415e84bbcec343022119","difficulty":2,"cognitiveDemand":"analyze","questionArchetype":"graph_comparison","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"พิจารณาเครื่องหมายและค่าสัมบูรณ์ของ a","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-008","ordinal":8,
      "slot_spec":{"learningObjective":"สร้างสมการพาราโบลาจากจุดยอดและจุดที่กราฟผ่าน","topic":"pt_e6f0415e84bbcec343022119","difficulty":3,"cognitiveDemand":"analyze","questionArchetype":"equation_from_conditions","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"พาราโบลามีจุดยอดที่ (2, -1) และผ่านจุด (0, 7) สมการของพาราโบลาคือข้อใด","choices":["y = 2(x - 2)² - 1","y = 2(x + 2)² - 1","y = (x - 2)² + 3","y = -2(x - 2)² - 1"],"correctIndex":0,"explanation":"ใช้รูป y=a(x-2)²-1 แล้วแทนจุด (0,7): 7=4a-1 จึงได้ a=2 ดังนั้น y=2(x-2)²-1","answerType":"single_choice","learningObjective":"สร้างสมการพาราโบลาจากจุดยอดและจุดที่กราฟผ่าน","topic":"pt_e6f0415e84bbcec343022119","difficulty":3,"cognitiveDemand":"analyze","questionArchetype":"equation_from_conditions","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"แทนจุดยอดในรูป y=a(x-h)²+k แล้วใช้จุดอีกจุดหา a","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-009","ordinal":9,
      "slot_spec":{"learningObjective":"หาค่าต่ำสุดของฟังก์ชันกำลังสองจากการจัดรูปจุดยอด","topic":"pt_e6f0415e84bbcec343022119","difficulty":3,"cognitiveDemand":"analyze","questionArchetype":"minimum_value","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"ฟังก์ชัน f(x) = 2x² - 8x + 11 มีค่าต่ำสุดเท่าใด","choices":["-5","2","3","11"],"correctIndex":2,"explanation":"จัดรูปได้ f(x)=2(x²-4x)+11=2(x-2)²+3 เนื่องจาก 2(x-2)² มีค่าน้อยสุดเป็น 0 จึงได้ค่าต่ำสุดของ f เท่ากับ 3","answerType":"single_choice","learningObjective":"หาค่าต่ำสุดของฟังก์ชันกำลังสองจากการจัดรูปจุดยอด","topic":"pt_e6f0415e84bbcec343022119","difficulty":3,"cognitiveDemand":"analyze","questionArchetype":"minimum_value","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"ทำกำลังสองสมบูรณ์แล้วอ่านค่าต่ำสุดจากรูปจุดยอด","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    },
    {
      "slot_key":"parabola-010","ordinal":10,
      "slot_spec":{"learningObjective":"ประยุกต์ใช้จุดยอดของพาราโบลาเพื่อหาค่าสูงสุดในสถานการณ์","topic":"pt_e6f0415e84bbcec343022119","difficulty":3,"cognitiveDemand":"analyze","questionArchetype":"maximum_application","representationType":"none","answerType":"single_choice"},
      "candidate":{"schemaVersion":"question-candidate/v1","revision":1,"questionText":"ความสูงของลูกบอลหลังจากผ่านไป t วินาทีแทนด้วย h(t) = -5t² + 20t + 1 ลูกบอลจะขึ้นไปได้สูงสุดกี่เมตร","choices":["16 เมตร","20 เมตร","21 เมตร","25 เมตร"],"correctIndex":2,"explanation":"พาราโบลาคว่ำจึงมีค่าสูงสุดที่ t=-b/(2a)=-20/(2×-5)=2 แทนค่าได้ h(2)=-5(4)+20(2)+1=21 เมตร","answerType":"single_choice","learningObjective":"ประยุกต์ใช้จุดยอดของพาราโบลาเพื่อหาค่าสูงสุดในสถานการณ์","topic":"pt_e6f0415e84bbcec343022119","difficulty":3,"cognitiveDemand":"analyze","questionArchetype":"maximum_application","representationType":"none","needsAsset":false,"assetPrompt":null,"reasoningTemplate":"หาเวลาที่จุดยอดด้วย t=-b/(2a) แล้วแทนค่าในฟังก์ชัน","duplicateRisk":"low","authorVersion":"question-authoring-v1"}
    }
  ]
  $items$::jsonb;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'slot_key', item->>'slot_key',
    'ordinal', (item->>'ordinal')::integer,
    'slot_spec', item->'slot_spec'
  ) order by (item->>'ordinal')::integer)
  into v_slots
  from pg_catalog.jsonb_array_elements(v_items) item;

  v_profile := pg_catalog.jsonb_build_object(
    'schemaVersion','question-factory-profile/v1',
    'pilot','phase-5.6-controlled-pilot',
    'scope',pg_catalog.jsonb_build_object('stage','lower_secondary','grade',9,'subject','math','unit','cc_6ec94863a615f997c2e8666a'),
    'curriculumChapter',pg_catalog.jsonb_build_object(
      'curriculumChapterId',12,
      'curriculumChapterKey','cc_6ec94863a615f997c2e8666a',
      'gradeBand','junior','gradeLevel','ม.3','productSubject','math','productBranch',null,
      'subjectLabel','คณิตศาสตร์','chapter','กราฟของฟังก์ชันกำลังสอง','chapterOrder',2
    ),
    'categoryMapping',pg_catalog.jsonb_build_object(
      'mappingEntryId','pcm_6a1d446ac588b5d20ef824b7',
      'mappingVersion','question-product-mapping/v1',
      'topicId','pt_e6f0415e84bbcec343022119',
      'productCategory','ฟังก์ชันกำลังสอง/พาราโบลา'
    ),
    'publicationPolicy','human-review-required-no-auto-publish'
  );

  v_blueprint := pg_catalog.jsonb_build_object(
    'schemaVersion','question-factory-blueprint/v1',
    'pilot','phase-5.6-controlled-pilot',
    'targetItems',10,
    'representationPolicy','text-only',
    'difficultyDistribution',pg_catalog.jsonb_build_object('1',3,'2',4,'3',3),
    'slots',v_slots
  );

  v_profile_checksum := 'sha256:' || pg_catalog.encode(extensions.digest(v_profile::text,'sha256'),'hex');
  v_blueprint_checksum := 'sha256:' || pg_catalog.encode(extensions.digest(v_blueprint::text,'sha256'),'hex');
  v_request_checksum := 'sha256:' || pg_catalog.encode(extensions.digest(
    v_scope_key || v_profile::text || v_blueprint::text || v_slots::text,'sha256'),'hex');

  v_result := public.question_factory_create_run(
    v_run_key,v_request_checksum,v_scope_key,'codex:phase-5.6-controlled-pilot',
    'm3-math-parabola-profile','2026-08-29-pilot-1','question-factory-profile/v1',v_profile_checksum,v_profile,
    'm3-math-parabola-blueprint','2026-08-29-pilot-1','question-factory-blueprint/v1',v_blueprint_checksum,v_blueprint,
    10,10,10,10,2::smallint,3::smallint,v_slots
  );
  v_run_id := (v_result->>'run_id')::bigint;
  if (v_result->>'replayed')::boolean then
    raise exception 'controlled pilot run key already exists';
  end if;

  v_result := public.question_factory_start_run(
    v_run_key,0,'pilot:m3-parabola:start','codex:phase-5.6-controlled-pilot'
  );
  if v_result->>'status' <> 'running' then raise exception 'pilot run did not start: %', v_result; end if;

  for v_item in
    select value from pg_catalog.jsonb_array_elements(v_items) order by (value->>'ordinal')::integer
  loop
    perform public.question_factory_transition_text_slot(
      v_run_key,v_item->>'slot_key',0,'planned','authoring','AUTHOR_STARTED','BLUEPRINT_SLOT_ASSIGNED','{}'::jsonb,
      'pilot:'||(v_item->>'slot_key')||':author:start','question-authoring-v1'
    );
    perform public.question_factory_transition_text_slot(
      v_run_key,v_item->>'slot_key',1,'authoring','question_qc','AUTHOR_COMPLETE','CANDIDATE_SCHEMA_VALID',
      pg_catalog.jsonb_build_object('candidate',v_item->'candidate'),
      'pilot:'||(v_item->>'slot_key')||':author:rev1','question-authoring-v1'
    );
    perform public.question_factory_transition_text_slot(
      v_run_key,v_item->>'slot_key',2,'question_qc','pending_human_review','QUESTION_QC_PASS','TEXT_QC_PASS_NO_ASSET',
      pg_catalog.jsonb_build_object('decision',pg_catalog.jsonb_build_object(
        'schemaVersion','question-qc/v1','decision','PASS','issues','[]'::jsonb,
        'checks',pg_catalog.jsonb_build_object(
          'answer_correctness','pass','choice_uniqueness','pass','explanation_consistency','pass',
          'scope_alignment','pass','difficulty_alignment','pass','legacy_duplicate_scan','pass','asset_contract','not_applicable'
        ),
        'notes','Verified calculation, unique distractors, explanation, M.3 scope, mapping and no exact legacy duplicate.',
        'qcVersion','question-qc-v1'
      )),
      'pilot:'||(v_item->>'slot_key')||':qc:pass','question-qc-v1'
    );
  end loop;

  if (select count(*) from public.question_factory_slots where run_id=v_run_id) <> 10
     or (select count(*) from public.question_factory_slots where run_id=v_run_id and state='pending_human_review' and state_version=3) <> 10
     or (select count(*) from public.question_factory_events where run_id=v_run_id and event_type='QUESTION_QC_PASS') <> 10
     or (select count(*) from public.questions q where q.question_text in (
       select e.payload->'candidate'->>'questionText'
       from public.question_factory_events e
       where e.run_id=v_run_id and e.event_type='AUTHOR_COMPLETE'
     )) <> 0 then
    raise exception 'controlled pilot postconditions failed';
  end if;
end
$$;

commit;

select r.id, r.run_key, r.scope_key, r.status, r.state_version,
       count(*) as slots,
       count(*) filter (where s.state='pending_human_review') as pending_human_review
from public.question_factory_runs r
join public.question_factory_slots s on s.run_id=r.id
where r.run_key='7caadaf2-b08b-4d3e-a5f1-4cf424cd11cc'
group by r.id, r.run_key, r.scope_key, r.status, r.state_version;
