-- ด่านสุดท้ายใน DB: หนึ่งคู่มีแมตช์ active ได้ทีละ 1 (ต่อจาก trigger ใน 20260930010059)
-- สร้างได้หลังปิดแมตช์ active ซ้อนของบัญชีทดสอบ (80d2bda7… -> abandoned) แล้ว
create unique index pvp_one_active_match_per_pair
  on public.pvp_matches (least(player_a_id, player_b_id), greatest(player_a_id, player_b_id))
  where status = 'active';
