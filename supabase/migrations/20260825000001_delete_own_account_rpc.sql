-- Google Play policy บังคับว่าแอปที่มีระบบสร้างบัญชี ต้องมี in-app path ให้ผู้ใช้ลบบัญชี+ข้อมูลตัวเองได้
-- (ไม่ใช่แค่ติดต่อทางอีเมล) ดู doc/closed-testing-launch-plan-2026-08-25.md เฟส 2
--
-- profiles ไม่มี FK ไปที่ auth.users และหลายตารางอ้าง pets/raid_runs ด้วย ON DELETE NO ACTION (ไม่ cascade)
-- จึงต้องลบข้อมูลลูกเองตามลำดับที่ปลอดภัยก่อนลบ pets/raid_runs/profiles/auth.users
-- (สำรวจ FK จริงทั้งหมดจาก information_schema แล้วก่อนเขียน migration นี้)
--
-- player_feedback: ตารางระบุ "append-only ห้าม update/delete" (เก็บไว้อ้างอิงแม้คนส่งจะลบบัญชีไปแล้ว)
-- จึงลบแค่การเชื่อมโยงตัวตน (user_id = null) แทนการลบทั้งแถว — user_id ใน player_feedback มีไว้เพื่อ
-- safety follow-up เท่านั้น ตัดออกก็พอสำหรับ Google Play requirement (ไม่มี PII เชื่อมกับตัวตนแล้ว)
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'ไม่พบผู้ใช้ที่ login อยู่';
  end if;

  -- ลูกที่อ้าง pets/raid_runs แบบ NO ACTION ต้องลบก่อน ไม่งั้นชน FK ตอนลบ pets/raid_runs
  delete from raid_tickets where user_id = uid;
  delete from quiz_attempts where user_id = uid;
  delete from raid_gear_items where owner_user_id = uid;
  delete from dungeon_runs where user_id = uid;
  delete from pet_feedings where user_id = uid;
  delete from user_achievements where user_id = uid;
  delete from weekly_leaderboard_rewards where user_id = uid; -- ก่อน player_eggs (FK player_egg_id เป็น NO ACTION)
  delete from raid_runs where user_id = uid; -- ลูก (raid_boss_questions, raid_run_steps) cascade เอง

  delete from pets where user_id = uid; -- ลูกที่เหลือ (analytics_events, player_eggs, player_feedback,
                                         -- profile_settings.pride_pet_id) เป็น SET NULL หรือ CASCADE อยู่แล้ว

  delete from profile_settings where user_id = uid;
  delete from player_eggs where user_id = uid;
  delete from player_food where user_id = uid;
  delete from daily_missions where user_id = uid;
  delete from dungeon_pity where user_id = uid;
  delete from raid_pity where user_id = uid;
  delete from raid_allowlist where user_id = uid;
  delete from user_pinned_achievements where user_id = uid;
  delete from analytics_events where user_id = uid;
  delete from test_accounts where user_id = uid;
  delete from achievement_tester_eligibility where user_id = uid;

  delete from friend_requests where requester_id = uid or addressee_id = uid;
  delete from friendships where user_id_low = uid or user_id_high = uid;
  delete from profile_likes where liker_id = uid or profile_user_id = uid;
  delete from blocks where blocker_id = uid or blocked_id = uid;
  delete from encouragements where sender_id = uid or recipient_id = uid;

  update player_feedback set user_id = null where user_id = uid;

  -- push_devices, push_preferences, notification_jobs (+ notification_deliveries ที่อ้างสองตารางนั้น)
  -- cascade อัตโนมัติจากบรรทัดนี้ (FK ทั้งหมดไป profiles เป็น ON DELETE CASCADE)
  delete from profiles where id = uid;

  delete from auth.users where id = uid;
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
