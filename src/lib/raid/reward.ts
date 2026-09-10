import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RaidStatKey } from "@/lib/raid/stats";
import type { ClaimRaidRewardResult } from "@/app/raid/actions";
export async function mapRaidReward(data: unknown): Promise<ClaimRaidRewardResult> {
  const supabase = await createClient();
  const row = data as {
    gear_id: string;
    slot: "head" | "body" | "feet";
    main_stat: RaidStatKey;
    main_value: number;
    sub_stat: RaidStatKey | null;
    sub_value: number | null;
    quality: string;
    egg_awarded: boolean;
    egg_type_id: string | null;
    egg_name_th: string | null;
    pity_meter: number;
  };

  // ไม่แตะ RPC เลย — อ่าน label_th (แสงริบหรี่/นวล/จ้า/เจิดจ้า) เพิ่มจาก raid_gear_qualities กับ
  // sprite_prefix ของไข่ (เฉพาะตอนได้ไข่รอบนี้) แยกต่างหากหลังเรียก RPC เสร็จ ยิงคู่กันได้ไม่ต้องรอกัน
  const [{ data: qualityRow }, { data: eggTypeRow }] = await Promise.all([
    supabase.from("raid_gear_qualities").select("label_th").eq("code", row.quality).maybeSingle(),
    row.egg_awarded && row.egg_type_id
      ? supabase.from("egg_types").select("sprite_prefix").eq("id", row.egg_type_id).maybeSingle()
      : Promise.resolve({ data: null as { sprite_prefix: string } | null }),
  ]);

  return {
    id: row.gear_id,
    slot: row.slot,
    mainStat: row.main_stat,
    mainValue: row.main_value,
    subStat: row.sub_stat,
    subValue: row.sub_value,
    quality: row.quality,
    qualityLabel: qualityRow?.label_th ?? null,
    eggAwarded: row.egg_awarded,
    eggTypeId: row.egg_type_id,
    eggNameTh: row.egg_name_th,
    eggSpritePrefix: eggTypeRow?.sprite_prefix ?? null,
    pityMeter: row.pity_meter,
  };
}
