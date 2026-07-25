-- Migration: qmon_messages_diagnostics
--
-- เพิ่มคอลัมน์วินิจฉัยลง qmon_messages ตาม spec เดิม (เอกสารระบุว่าต้องมี error/latency_ms
-- แต่ migration 20260724063950 ไม่ได้ใส่ไว้) — เจอปัญหาจริง 25 ก.ค. 2026: Gemini fallback
-- 8/8 ครั้งโดยไม่มีทางรู้สาเหตุ เพราะ generateQmonMessage() ใช้ catch {} ทิ้ง error object
--
-- ไม่แตะ RLS: policy เดิมเป็น row-level (ownership ผ่าน pets) ครอบคอลัมน์ใหม่อยู่แล้ว
-- ยังไม่มี update/delete policy ตามเจตนาเดิม (append-only audit trail)

alter table public.qmon_messages
  add column if not exists error_reason text,
  add column if not exists latency_ms   integer,
  add column if not exists model        text;

comment on column public.qmon_messages.error_reason is
  'สาเหตุที่ Gemini ล้ม (HTTP status + error body ของ Google, ตัดที่ 300 ตัวอักษร) — null เมื่อสำเร็จ. ห้ามเก็บ prompt หรือ PII ของผู้ใช้';
comment on column public.qmon_messages.latency_ms is
  'เวลาที่ใช้เรียก Gemini (ms) นับรวมเคสที่ล้ม/timeout ด้วย เพื่อดูว่าชนเพดาน function timeout ไหม';
comment on column public.qmon_messages.model is
  'ชื่อ model ที่ส่งไป (ตอนนี้เป็น alias gemini-flash-latest) — เก็บไว้เพราะ alias resolve เปลี่ยนได้เงียบๆ';
