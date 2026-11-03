import { CircleSlash, Crosshair, Droplets, Eye, PawPrint, Shield, Sparkles, Swords, Zap, type LucideIcon } from "lucide-react";
import { incomingDamage, type CardId, type ChapterBattle, type IntentId } from "@/lib/raid/cards/engine";

export const MOVES: Partial<Record<CardId, { name: string; description: string; kind: "atk" | "sup" | "def"; icon: LucideIcon }>> = {
  strike: { name: "โจมตีหนัก", description: "ตีแรงที่สุด", kind: "atk", icon: Swords },
  mend: { name: "ดูดเลือด", description: "ตีแล้วเติมเลือดให้เรา", kind: "sup", icon: Droplets },
  counter: { name: "ตั้งรับสวนกลับ", description: "โดนเบาลงครึ่งหนึ่ง แล้วสวนกลับ", kind: "def", icon: Shield },
  pierce: { name: "เจาะเกราะ", description: "ตีทะลุเกราะที่บอสตั้งไว้", kind: "atk", icon: Crosshair },
  interrupt: { name: "ขัดจังหวะ", description: "หยุดท่าที่บอสกำลังชาร์จ", kind: "def", icon: CircleSlash },
  focus: { name: "เปิดจุดอ่อน", description: "ข้อหน้าตีแรงขึ้นมาก", kind: "sup", icon: Eye },
};

export const INTENT_LABELS: Partial<Record<IntentId, { name: string; icon: LucideIcon; threat: number }>> = {
  claw: { name: "จะตะปบใส่เรา", icon: PawPrint, threat: 2 },
  brace: { name: "ตั้งเกราะ", icon: Shield, threat: 1 },
  charge: { name: "กำลังชาร์จพลัง", icon: Zap, threat: 0 },
  thunder: { name: "ปล่อยท่าหนัก", icon: Zap, threat: 3 },
  recover: { name: "เสียหลักอยู่", icon: Sparkles, threat: 0 },
};

// A boss that deals no damage this question shows no bars, whatever the intent.
export function threatLevel(b: ChapterBattle): number {
  if (incomingDamage(b) <= 0) return 0;
  return INTENT_LABELS[b.intent]?.threat ?? 2;
}
