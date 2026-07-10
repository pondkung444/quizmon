import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSpeciesName, type Subline, type Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import { SUBLINE_LABEL } from "@/lib/labels";
import SignOutLink from "@/components/SignOutLink";
import CollectedPetCard from "@/components/CollectedPetCard";

// หน้ารายละเอียด read-only ของ Qmon ที่เก็บเข้าสมุดแล้ว — ต่างจาก /pet ตรงที่ดึงจาก petId
// ใน param แทน is_active=true และไม่ import CollectPetButton/EggChoiceModal เข้ามาเลย
// (การันตี write-free โดยโครงสร้าง ไม่ใช่แค่ซ่อนปุ่มด้วย flag)
export default async function CollectionPetDetailPage({
  params,
}: {
  params: Promise<{ petId: string }>;
}) {
  const { petId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: pet } = await supabase
    .from("pets")
    .select(
      "nickname, stage, subline, personality, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, egg_types(sprite_prefix, name_th)"
    )
    .eq("id", petId)
    .eq("user_id", user.id)
    .maybeSingle();

  // ต้องเป็นตัวที่ผ่าน stage 4 + ล็อก subline/personality/stat_* ครบแล้วเท่านั้นถึงดูได้
  // (ตัวที่กำลังเลี้ยงอยู่ตอนนี้ยังไม่ถึงระยะนี้จะไม่มีทางมี petId ในสมุดสะสมอยู่แล้ว)
  const hasFullStats =
    pet?.stat_hp != null &&
    pet?.stat_atk != null &&
    pet?.stat_def != null &&
    pet?.stat_spd != null &&
    pet?.stat_foc != null;

  if (!pet || pet.stage !== 4 || !pet.subline || !pet.personality || !hasFullStats) {
    notFound();
  }

  const eggType = Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types;
  if (!eggType) notFound();

  const subline = pet.subline as Subline;
  const personality = pet.personality as Personality;

  const petImagePath = getPetImagePath(eggType.sprite_prefix, 4, subline, personality);
  const speciesName = getSpeciesName(eggType.sprite_prefix, 4, subline, personality, eggType.name_th);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <SignOutLink />
      <Link href="/collection" className="text-sm text-text3 transition hover:text-gold-hi">
        ← กลับสมุดสะสม
      </Link>
      <CollectedPetCard
        nickname={pet.nickname}
        speciesName={speciesName}
        petImagePath={petImagePath}
        sublineLabel={SUBLINE_LABEL[subline] ?? subline}
        eggNameTh={eggType.name_th}
        stats={{
          hp: pet.stat_hp as number,
          atk: pet.stat_atk as number,
          def: pet.stat_def as number,
          spd: pet.stat_spd as number,
          foc: pet.stat_foc as number,
        }}
      />
    </main>
  );
}
