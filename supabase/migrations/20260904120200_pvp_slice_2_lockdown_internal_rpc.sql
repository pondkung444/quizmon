-- Migration: 20260904120200_pvp_slice_2_lockdown_internal_rpc
-- ปิดช่องเรียก _pvp_resolve_round ตรงผ่าน PostgREST
--
-- โปรเจกต์นี้มี ALTER DEFAULT PRIVILEGES ที่ grant EXECUTE ให้ anon/authenticated
-- บนฟังก์ชัน schema public โดยอัตโนมัติ -> `revoke ... from public` อย่างเดียวไม่พอ
-- (advisor: anon_security_definer_function_executable)
--
-- _pvp_resolve_round = internal เรโซลูชันยก ถ้าเรียกตรงได้จะ force-resolve ยกของแมตช์คนอื่น
-- เป็น "ตอบผิด" ได้ -> griefing. ต้องเรียกผ่าน submit_pvp_card / pvp_gc_round_timeouts เท่านั้น
-- (ทั้งคู่เป็น SECURITY DEFINER จึงยังเรียก _pvp_resolve_round ได้แม้ผู้เรียกไม่มีสิทธิ์)

begin;

revoke execute on function public._pvp_resolve_round(uuid, int, boolean) from anon, authenticated, public;

commit;

-- Rollback: (ไม่ต้อง — ไม่ควรเปิดคืน)
