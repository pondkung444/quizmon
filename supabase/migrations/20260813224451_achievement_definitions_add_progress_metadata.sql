alter table public.achievement_definitions
  add column progress_metric text,
  add column progress_target integer;

comment on column public.achievement_definitions.progress_metric is 'กลุ่มตัวชี้วัดที่ใช้คำนวณ progress (เช่น training, farm, gear_obtained) — null = เหรียญนี้เป็นแบบ boolean (ได้รับแล้ว/ยังไม่ได้) ไม่มี progress bar';
comment on column public.achievement_definitions.progress_target is 'ค่าเป้าหมายของเหรียญนี้ในกลุ่ม progress_metric — null คู่กับ progress_metric เสมอ';

update public.achievement_definitions set progress_metric = 'training', progress_target = 10 where id = 'training_10';
update public.achievement_definitions set progress_metric = 'training', progress_target = 50 where id = 'training_50';
update public.achievement_definitions set progress_metric = 'training', progress_target = 100 where id = 'training_100';
update public.achievement_definitions set progress_metric = 'training', progress_target = 250 where id = 'training_250';
update public.achievement_definitions set progress_metric = 'training', progress_target = 500 where id = 'training_500';
update public.achievement_definitions set progress_metric = 'training', progress_target = 1000 where id = 'training_1000';

update public.achievement_definitions set progress_metric = 'daily_days', progress_target = 2 where id = 'daily_days_2';
update public.achievement_definitions set progress_metric = 'daily_days', progress_target = 5 where id = 'daily_days_5';
update public.achievement_definitions set progress_metric = 'daily_days', progress_target = 10 where id = 'daily_days_10';
update public.achievement_definitions set progress_metric = 'daily_days', progress_target = 20 where id = 'daily_days_20';
update public.achievement_definitions set progress_metric = 'daily_days', progress_target = 45 where id = 'daily_days_45';
update public.achievement_definitions set progress_metric = 'daily_days', progress_target = 90 where id = 'daily_days_90';

update public.achievement_definitions set progress_metric = 'daily_streak', progress_target = 3 where id = 'daily_streak_3';
update public.achievement_definitions set progress_metric = 'daily_streak', progress_target = 7 where id = 'daily_streak_7';
update public.achievement_definitions set progress_metric = 'daily_streak', progress_target = 15 where id = 'daily_streak_15';
update public.achievement_definitions set progress_metric = 'daily_streak', progress_target = 30 where id = 'daily_streak_30';

update public.achievement_definitions set progress_metric = 'correct', progress_target = 10 where id = 'correct_10';
update public.achievement_definitions set progress_metric = 'correct', progress_target = 50 where id = 'correct_50';
update public.achievement_definitions set progress_metric = 'correct', progress_target = 250 where id = 'correct_250';
update public.achievement_definitions set progress_metric = 'correct', progress_target = 700 where id = 'correct_700';

update public.achievement_definitions set progress_metric = 'perfect_daily', progress_target = 1 where id = 'perfect_daily_1';
update public.achievement_definitions set progress_metric = 'perfect_daily', progress_target = 3 where id = 'perfect_daily_3';
update public.achievement_definitions set progress_metric = 'perfect_daily', progress_target = 10 where id = 'perfect_daily_10';
update public.achievement_definitions set progress_metric = 'perfect_daily', progress_target = 20 where id = 'perfect_daily_20';

update public.achievement_definitions set progress_metric = 'farm', progress_target = 1 where id = 'farm_qmon_1';
update public.achievement_definitions set progress_metric = 'farm', progress_target = 5 where id = 'farm_qmon_5';
update public.achievement_definitions set progress_metric = 'farm', progress_target = 10 where id = 'farm_qmon_10';
update public.achievement_definitions set progress_metric = 'farm', progress_target = 15 where id = 'farm_qmon_15';

update public.achievement_definitions set progress_metric = 'unique_forms', progress_target = 3 where id = 'unique_stage4_forms_3';
update public.achievement_definitions set progress_metric = 'unique_forms', progress_target = 6 where id = 'unique_stage4_forms_6';
update public.achievement_definitions set progress_metric = 'unique_forms', progress_target = 12 where id = 'unique_stage4_forms_12';

update public.achievement_definitions set progress_metric = 'adventure_claim', progress_target = 1 where id = 'adventure_claim_1';
update public.achievement_definitions set progress_metric = 'adventure_claim', progress_target = 10 where id = 'adventure_claim_10';
update public.achievement_definitions set progress_metric = 'adventure_claim', progress_target = 50 where id = 'adventure_claim_50';
update public.achievement_definitions set progress_metric = 'adventure_claim', progress_target = 100 where id = 'adventure_claim_100';

update public.achievement_definitions set progress_metric = 'gear_obtained', progress_target = 1 where id = 'gear_obtained_1';
update public.achievement_definitions set progress_metric = 'gear_obtained', progress_target = 10 where id = 'gear_obtained_10';
update public.achievement_definitions set progress_metric = 'gear_obtained', progress_target = 30 where id = 'gear_obtained_30';
update public.achievement_definitions set progress_metric = 'gear_obtained', progress_target = 75 where id = 'gear_obtained_75';

update public.achievement_definitions set progress_metric = 'challenge_hard_wins', progress_target = 50 where id = 'challenge_hard_wins_50';
