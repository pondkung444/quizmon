// normalize เดียวกับที่ RPC ทำซ้ำอีกชั้น (safety net) — ทำฝั่ง client ก่อนด้วยเพื่อให้ปุ่มค้นหา
// เปิดใช้งานได้ถูกจังหวะ (พอครบ 8 ตัวหลัง normalize แล้ว) ไม่ต้องรอ round-trip ไปเช็คที่ server
// อยู่คนละไฟล์จาก actions.ts เพราะไฟล์ "use server" ห้าม export ฟังก์ชัน sync ธรรมดา
export function normalizeFriendCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
