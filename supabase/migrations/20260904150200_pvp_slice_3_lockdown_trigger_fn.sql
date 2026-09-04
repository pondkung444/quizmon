-- Migration: 20260904150200_pvp_slice_3_lockdown_trigger_fn
-- ปิดช่องเรียก trigger function ตรงผ่าน PostgREST (ตามที่เจอกับ _draw_pvp_hand / _pvp_resolve_round)
-- โปรเจกต์นี้มี ALTER DEFAULT PRIVILEGES grant EXECUTE ให้ anon/authenticated ทุกฟังก์ชัน public
-- trigger fire ในนามเจ้าของตารางอยู่แล้ว ไม่ต้องมี EXECUTE ให้ role ไหน

begin;

revoke execute on function public._pvp_refund_ticket_on_challenge_close() from anon, authenticated, public;

commit;
