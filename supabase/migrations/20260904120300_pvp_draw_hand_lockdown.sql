-- Migration: 20260904120300_pvp_draw_hand_lockdown
-- ปิดช่องเรียก _draw_pvp_hand ตรงผ่าน PostgREST (บั๊กแฝงจากสไลซ์ 1)
--
-- สไลซ์ 1 ทำแค่ `revoke execute ... from public` ซึ่งไม่พอ เพราะโปรเจกต์นี้มี
-- ALTER DEFAULT PRIVILEGES grant EXECUTE ให้ anon/authenticated บนฟังก์ชัน public ทุกตัว
-- -> /rpc/_draw_pvp_hand เรียกได้โดยใครก็ได้ = force จั่วมือของแมตช์คนอื่น
-- เรียกจริงผ่าน accept_pvp_challenge / draw_pvp_cards / submit_pvp_card (ทั้งหมด SECURITY DEFINER) เท่านั้น

begin;

revoke execute on function public._draw_pvp_hand(uuid, uuid) from anon, authenticated, public;

commit;
