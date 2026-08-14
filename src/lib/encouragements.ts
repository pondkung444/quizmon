import type { createClient } from "@/lib/supabase/server";
import type { PetPreview } from "@/components/social/petSummary";
import type { EncouragementMessageKey } from "@/lib/encouragementMessages";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ReceivedEncouragement = {
  encouragementId: string;
  senderId: string;
  senderUsername: string;
  pet: PetPreview;
  messageKey: EncouragementMessageKey;
  sentDate: string;
  alreadySentBackToday: boolean;
};

type ReceivedRow = {
  encouragement_id: string;
  sender_id: string;
  sender_username: string;
  pet_nickname: string | null;
  pet_stage: number | null;
  pet_subline: string | null;
  pet_personality: string | null;
  egg_sprite_prefix: string | null;
  egg_name_th: string | null;
  message_key: EncouragementMessageKey;
  sent_date: string;
  already_sent_back_today: boolean;
};

// เรียกครั้งเดียว mark ทุกแถวที่ยังไม่อ่านเป็นอ่านแล้วทันที (ฝั่ง RPC) — ห้ามเรียกฟังก์ชันนี้ที่ไหน
// นอกจาก S08 จริงๆ เพราะมีผลข้างเคียงเคลียร์จุดแจ้งเตือนทันทีที่เรียก
export async function getReceivedEncouragements(supabase: SupabaseServerClient): Promise<ReceivedEncouragement[]> {
  const { data, error } = await supabase.rpc("list_encouragements_received");
  if (error) throw new Error("โหลดกำลังใจไม่สำเร็จ: " + error.message);

  return ((data ?? []) as ReceivedRow[]).map((row) => ({
    encouragementId: row.encouragement_id,
    senderId: row.sender_id,
    senderUsername: row.sender_username,
    pet:
      row.egg_sprite_prefix && row.egg_name_th && row.pet_stage != null
        ? {
            nickname: row.pet_nickname,
            stage: row.pet_stage,
            subline: row.pet_subline,
            personality: row.pet_personality,
            eggSpritePrefix: row.egg_sprite_prefix,
            eggNameTh: row.egg_name_th,
          }
        : null,
    messageKey: row.message_key,
    sentDate: row.sent_date,
    alreadySentBackToday: row.already_sent_back_today,
  }));
}

export async function getUnreadEncouragementCount(supabase: SupabaseServerClient): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_encouragement_count");
  if (error) throw new Error("โหลดจำนวนกำลังใจที่ยังไม่อ่านไม่สำเร็จ: " + error.message);
  return (data as number | null) ?? 0;
}

export async function getHasSentEncouragementToday(
  supabase: SupabaseServerClient,
  recipientId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_sent_encouragement_today", { p_recipient_id: recipientId });
  if (error) throw new Error("เช็คสถานะกำลังใจไม่สำเร็จ: " + error.message);
  return (data as boolean | null) ?? false;
}
