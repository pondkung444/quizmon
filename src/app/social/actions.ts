"use server";

import { createClient, getUser } from "@/lib/supabase/server";
import { normalizeFriendCode } from "@/lib/friendCode";
import type { PetPreview } from "@/components/social/petSummary";
import type { EncouragementMessageKey } from "@/lib/encouragementMessages";
import { getRanking, type RankingCategory, type RankingData, type RankingScope } from "@/lib/ranking";
import { sendSocialEventPush } from "@/lib/push/socialEventPush";

export type RelationshipStatus =
  | "self"
  | "friends"
  | "pending_sent"
  | "pending_received"
  | "friend_list_full"
  | "available";

export type SearchFriendCodeResult =
  | { found: false }
  | {
      found: true;
      relationshipStatus: RelationshipStatus;
      targetUserId: string;
      username: string;
      pet: PetPreview;
    };

export async function setPrideQmon(petId: string): Promise<{ pridePetId: string; favoritePetIds: string[] }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, is_active, stage")
    .eq("id", petId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pet || !(pet.is_active || pet.stage === 4)) {
    throw new Error("เลือก Qmon ตัวนี้เป็นตัวที่ภูมิใจไม่ได้");
  }

  const { data: settings } = await supabase
    .from("profile_settings")
    .select("favorite_pet_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  // ถ้าตัวที่เพิ่งเลือกเป็น Qmon ที่ภูมิใจซ้ำกับที่อยู่ใน favorite อยู่แล้ว ต้องตัดออกจาก favorite
  // แบบเงียบๆ (ไม่ error ไม่เด้งเตือน) — กันกติกา "ไม่ซ้ำกัน" โดยไม่ลงโทษผู้เล่น
  const favoritePetIds = (settings?.favorite_pet_ids ?? []).filter((id: string) => id !== petId);

  const { error } = await supabase.from("profile_settings").upsert(
    {
      user_id: user.id,
      pride_pet_id: petId,
      favorite_pet_ids: favoritePetIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error("บันทึก Qmon ที่ภูมิใจไม่สำเร็จ: " + error.message);

  return { pridePetId: petId, favoritePetIds };
}

export async function setFavoriteQmon(petIds: string[]): Promise<{ favoritePetIds: string[] }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");
  if (petIds.length > 3) throw new Error("เลือก Qmon ตัวโปรดได้สูงสุด 3 ตัว");

  const supabase = await createClient();

  if (petIds.length > 0) {
    // DB constraint เช็คแค่ความยาว array ไม่เช็ค ownership/stage — ต้อง validate เองตรงนี้
    const { data: pets } = await supabase
      .from("pets")
      .select("id")
      .eq("user_id", user.id)
      .eq("stage", 4)
      .in("id", petIds);

    if ((pets?.length ?? 0) !== petIds.length) {
      throw new Error("มี Qmon ที่เลือกไม่ใช่ตัวที่โตเต็มที่แล้ว หรือไม่ใช่ของบัญชีนี้");
    }
  }

  const { error } = await supabase.from("profile_settings").upsert(
    { user_id: user.id, favorite_pet_ids: petIds, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw new Error("บันทึก Qmon ตัวโปรดไม่สำเร็จ: " + error.message);

  return { favoritePetIds: petIds };
}

export async function setPinnedMedals(achievementIds: string[]): Promise<{ pinnedAchievementIds: string[] }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");
  if (achievementIds.length > 3) throw new Error("ปักหมุดเหรียญได้สูงสุด 3 เหรียญ");

  const supabase = await createClient();

  if (achievementIds.length > 0) {
    const { data: earned } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", user.id)
      .in("achievement_id", achievementIds);

    if ((earned?.length ?? 0) !== achievementIds.length) {
      throw new Error("ปักหมุดได้เฉพาะเหรียญที่ปลดล็อกแล้วเท่านั้น");
    }
  }

  const { error: deleteError } = await supabase
    .from("user_pinned_achievements")
    .delete()
    .eq("user_id", user.id);
  if (deleteError) throw new Error("บันทึกเหรียญที่ปักหมุดไม่สำเร็จ: " + deleteError.message);

  if (achievementIds.length > 0) {
    const { error: insertError } = await supabase.from("user_pinned_achievements").insert(
      achievementIds.map((achievementId, index) => ({
        user_id: user.id,
        achievement_id: achievementId,
        pin_order: index + 1,
      }))
    );
    if (insertError) throw new Error("บันทึกเหรียญที่ปักหมุดไม่สำเร็จ: " + insertError.message);
  }

  return { pinnedAchievementIds: achievementIds };
}

export async function searchFriendCode(code: string): Promise<SearchFriendCodeResult> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("search_friend_code", { p_code: normalizeFriendCode(code) })
    .single();
  if (error || !data) throw new Error(error?.message ?? "ค้นหา Friend Code ไม่สำเร็จ");

  const row = data as {
    found: boolean;
    relationship_status: RelationshipStatus | null;
    target_user_id: string | null;
    username: string | null;
    pet_nickname: string | null;
    pet_stage: number | null;
    pet_subline: string | null;
    pet_personality: string | null;
    egg_sprite_prefix: string | null;
    egg_name_th: string | null;
  };

  if (!row.found) return { found: false };

  return {
    found: true,
    relationshipStatus: row.relationship_status as RelationshipStatus,
    targetUserId: row.target_user_id as string,
    username: row.username as string,
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
  };
}

export async function sendFriendRequest(
  targetUserId: string
): Promise<{ requestId: string; autoAccepted: boolean }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("send_friend_request", { p_target_user_id: targetUserId })
    .single();
  if (error || !data) throw new Error(error?.message ?? "ส่งคำขอเป็นเพื่อนไม่สำเร็จ");

  const row = data as { request_id: string; auto_accepted: boolean };

  // await ตรงๆ (ไม่ fire-and-forget) เพราะ Vercel serverless function อาจถูก kill ทันทีหลัง
  // ส่ง response กลับไป ทำให้ async work ที่ไม่ await ค้างไม่จบกลางทาง — sendSocialEventPush
  // ดักจับ error ข้างในเองแล้ว ไม่ throw ออกมา จึงไม่กระทบผลลัพธ์หลักของฟังก์ชันนี้
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  const actorUsername = profile?.username ?? "เพื่อนคนหนึ่ง";
  if (row.auto_accepted) {
    // targetUserId เคยส่งคำขอมาหาเราก่อนแล้ว — การกดของเราตอนนี้คือการ auto-accept
    // คำขอเดิมของเขา จึงแจ้งแบบ "ตอบรับเป็นเพื่อนแล้ว" ไม่ใช่ "ได้รับคำขอ"
    await sendSocialEventPush({
      recipientUserId: targetUserId,
      actorUserId: user.id,
      actorUsername,
      eventType: "friend_request_accepted",
      deepLink: `/social/friend/${user.id}`,
      idempotencyKey: `${targetUserId}:friend_request_accepted:${row.request_id}`,
    });
  } else {
    await sendSocialEventPush({
      recipientUserId: targetUserId,
      actorUserId: user.id,
      actorUsername,
      eventType: "friend_request_received",
      deepLink: "/social/requests",
      idempotencyKey: `${targetUserId}:friend_request_received:${row.request_id}`,
    });
  }

  return { requestId: row.request_id, autoAccepted: row.auto_accepted };
}

export async function respondFriendRequest(
  requestId: string,
  action: "accept" | "reject"
): Promise<{ status: string }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();

  // ดึง requester_id ไว้ก่อนเรียก RPC — เผื่อ RPC ลบ/แก้ row จนดึงย้อนหลังไม่ได้ (ไม่ผูกกับ
  // requester_id แค่ตอน action==="accept" เพื่อไม่เพิ่ม query ที่ไม่จำเป็นตอนปฏิเสธ)
  let requesterId: string | null = null;
  if (action === "accept") {
    const { data: reqRow } = await supabase
      .from("friend_requests")
      .select("requester_id")
      .eq("id", requestId)
      .maybeSingle();
    requesterId = reqRow?.requester_id ?? null;
  }

  const { data, error } = await supabase
    .rpc("respond_friend_request", { p_request_id: requestId, p_action: action })
    .single();
  if (error || !data) throw new Error(error?.message ?? "ตอบคำขอเป็นเพื่อนไม่สำเร็จ");

  if (action === "accept" && requesterId) {
    const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
    const actorUsername = profile?.username ?? "เพื่อนคนหนึ่ง";
    await sendSocialEventPush({
      recipientUserId: requesterId,
      actorUserId: user.id,
      actorUsername,
      eventType: "friend_request_accepted",
      deepLink: `/social/friend/${user.id}`,
      idempotencyKey: `${requesterId}:friend_request_accepted:${requestId}`,
    });
  }

  return data as { status: string };
}

export async function cancelFriendRequest(requestId: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_friend_request", { p_request_id: requestId });
  if (error) throw new Error(error.message ?? "ยกเลิกคำขอไม่สำเร็จ");
}

export async function removeFriend(friendUserId: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_friend", { p_friend_id: friendUserId });
  if (error) throw new Error(error.message ?? "ลบเพื่อนไม่สำเร็จ");
}

export async function blockUser(targetUserId: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { error } = await supabase.rpc("block_user", { p_target_id: targetUserId });
  if (error) throw new Error(error.message ?? "บล็อกผู้เล่นไม่สำเร็จ");
}

export async function unblockUser(targetUserId: string): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_user", { p_target_id: targetUserId });
  if (error) throw new Error(error.message ?? "เลิกบล็อกไม่สำเร็จ");
}

export async function toggleLike(targetUserId: string): Promise<{ liked: boolean; count: number }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_like", { p_target_user_id: targetUserId }).single();
  if (error || !data) throw new Error(error?.message ?? "ถูกใจไม่สำเร็จ");

  return data as { liked: boolean; count: number };
}

export async function sendEncouragement(
  recipientId: string,
  messageKey: EncouragementMessageKey
): Promise<{ encouragementId: string; sentDate: string }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("send_encouragement", { p_recipient_id: recipientId, p_message_key: messageKey })
    .single();
  if (error || !data) throw new Error(error?.message ?? "ส่งกำลังใจไม่สำเร็จ");

  const row = data as { encouragement_id: string; sent_date: string };

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  const actorUsername = profile?.username ?? "เพื่อนคนหนึ่ง";
  await sendSocialEventPush({
    recipientUserId: recipientId,
    actorUserId: user.id,
    actorUsername,
    eventType: "encouragement_received",
    deepLink: "/social/encouragements",
    idempotencyKey: `${recipientId}:encouragement_received:${row.encouragement_id}`,
  });

  return { encouragementId: row.encouragement_id, sentDate: row.sent_date };
}

// เรียกตอนสลับหมวด/ขอบเขตในแท็บ "อันดับ" — pattern เดียวกับ loadMoreHallOfFame
// (src/app/hall-of-fame/actions.ts): thin wrapper สร้าง client ของตัวเอง เรียก lib function เดิม
export async function loadRanking(category: RankingCategory, scope: RankingScope): Promise<RankingData> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();
  return getRanking(supabase, category, scope);
}
