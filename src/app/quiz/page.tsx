import { createClient } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { getPersonalityKey } from "@/lib/personality";
import type { Subline, Personality } from "@/lib/evolution";
import QuizClient from "@/components/QuizClient";

export default async function QuizPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let pet: {
    stage: number;
    subline: string | null;
    personality: string | null;
    egg_types: { sprite_prefix: string } | { sprite_prefix: string }[] | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("pets")
      .select("stage, subline, personality, egg_types(sprite_prefix)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    pet = data;
  }

  // ค่าชุดเดียว (stage/subline/personality) ใช้ได้ทั้งเลือกชุดบุคลิกและสร้าง path รูป avatar
  // ไม่ query ซ้ำ — ดู getPersonalityKey (src/lib/personality.ts) และ getPetImagePath (src/lib/petImage.ts)
  const personalityKey = getPersonalityKey(pet?.stage ?? 1, pet?.subline ?? null);

  const eggType = pet ? (Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types) : null;
  let petAvatarPath: string | null = null;
  if (pet && eggType) {
    try {
      petAvatarPath = getPetImagePath(
        eggType.sprite_prefix,
        pet.stage,
        (pet.subline ?? null) as Subline | null,
        (pet.personality ?? null) as Personality | null
      );
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 p-6">
      <QuizClient personalityKey={personalityKey} petAvatarPath={petAvatarPath} />
    </main>
  );
}
