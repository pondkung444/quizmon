// กติกาคาบตั้งใจ — ค่าฝั่ง server อยู่ใน supabase/migrations/20260925190000_classroom_focus_mode_phase_2.sql
// (focus_advance_participant / report_focus_signal) ต้องแก้คู่กันเสมอ

/** ก้อนโฟกัสต่อเนื่อง (server: c_block) */
export const FOCUS_BLOCK_MS = 10 * 60 * 1000;
/** เวลาให้กลับมาหลังหลุด 1 ครั้งต่อก้อน (server: c_grace) */
export const FOCUS_GRACE_MS = 10 * 1000;
/** client ping ทุกเท่านี้ — server ถือว่าหลุดเมื่อเงียบเกิน 25 วิ (c_hb_timeout) */
export const FOCUS_HEARTBEAT_MS = 10 * 1000;

/** ต้องวางนิ่ง (ไม่แตะจอ) นานเท่านี้ก่อนเริ่มก้อนใหม่ — กันเริ่มนับตอนยังถือเครื่องอยู่ */
export const FOCUS_SETTLE_MS = 5 * 1000;
/** หลังแตะจอ (warning) หยุดแตะนานเท่านี้ = กลับมาแล้ว (ต้องทันใน grace 10 วิ) */
export const FOCUS_TOUCH_QUIET_MS = 2 * 1000;
