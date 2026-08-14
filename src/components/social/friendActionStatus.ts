import type { RelationshipStatus } from "@/app/social/actions";

// ใช้ร่วมกันระหว่าง S06 (add-friend, เฟส 3) กับ S04 (public profile, เฟส 5) — extract ออกมาตอนเฟส 5
// กันข้อความ/เงื่อนไขปุ่ม "เพิ่มเพื่อน" เพี้ยนกันระหว่างสองหน้าที่ต่างก็เรียก relationship_status เดียวกัน
export const FRIEND_STATUS_MESSAGE: Record<RelationshipStatus, string | null> = {
  self: "นี่คือ Friend Code ของคุณเอง",
  friends: "เป็นเพื่อนกันอยู่แล้ว",
  pending_sent: "ส่งคำขอแล้ว รอเขาตอบรับ",
  pending_received: "เขาส่งคำขอมาหาคุณอยู่แล้ว — กดเพิ่มเพื่อนเพื่อตอบรับได้เลย",
  friend_list_full: "รายชื่อเพื่อนเต็มแล้ว (ฝั่งใดฝั่งหนึ่งครบ 100 คน)",
  available: null,
};

// ปุ่ม "เพิ่มเพื่อน" ใช้ได้ทั้งตอน available และ pending_received (เขาส่งคำขอมาหาเราค้างอยู่ก่อน) —
// send_friend_request จะ auto-accept ให้เองทันทีถ้าเจอคำขอย้อนกลับ ไม่ต้องมีปุ่ม "ตอบรับ" แยก
export const FRIEND_ACTIONABLE_STATUSES: RelationshipStatus[] = ["available", "pending_received"];
