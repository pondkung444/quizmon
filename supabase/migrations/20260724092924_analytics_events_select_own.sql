-- Migration: analytics_events_select_own
-- version: 20260724092924 (ตรงกับ supabase_migrations.schema_migrations ใน production)
--
-- analytics_events มีแค่ insert policy มาตั้งแต่ 014_analytics_events.sql ไม่มี select policy
-- ให้ authenticated เลย — ตอนแรก askQmonPractice() (เมนู "ควรฝึกอะไร") แก้ปัญหานี้ด้วย
-- admin client (service role) ข้าม RLS ไปเลย แต่พบว่าเสี่ยง: ความปลอดภัยทั้งหมดไปตกอยู่ที่การจำ
-- .eq("user_id", ...) ในทุกจุดที่โค้ดในอนาคตจะมาอ่านตารางนี้ผ่าน admin client (silent failure
-- ถ้ามีใครลืมสักจุด ไม่มี RLS คอยกันชั้นสอง) แก้ที่ต้นตอด้วย RLS policy จริงแทน — askQmonPractice()
-- กลับไปใช้ client ปกติ (RLS-respecting) เหมือนเมนูอื่นทั้งหมด
create policy "Users can view their own analytics events"
on public.analytics_events
for select
to authenticated
using (user_id = auth.uid());
