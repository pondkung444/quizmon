import { createClient } from "@/lib/supabase/server";
import { getSpeciesName, getSpeciesNameParts, type Subline, type Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import SignOutLink from "@/components/SignOutLink";
import CollectionGrid, { type CollectionSection, type CollectionSlot } from "@/components/CollectionGrid";

const SUBLINE_ORDER: Subline[] = ["math", "science", "balanced"];
const PERSONALITY_ORDER: Personality[] = ["A", "B"];

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let eggTypes: { id: string; name_th: string; sprite_prefix: string }[] = [];
  // combo (eggTypeId_subline_personality) -> id ของ "ตัวแรกที่เก็บ" (evolved_at เก่าสุด)
  // ใช้ตัวนี้ตัดสินทั้ง unlock และลิงก์ไปหน้า /collection/[petId] — ตัวซ้ำที่เก็บทีหลังยังอยู่ใน
  // DB ครบ แค่ไม่โผล่ในกริดซ้ำ (ดูโจทย์ข้อ 4 — deferred เรื่อง UI โชว์ตัวซ้ำไว้ก่อน)
  const firstPetIdByCombo = new Map<string, string>();

  if (user) {
    const [{ data: eggTypeRows }, { data: petRows }] = await Promise.all([
      supabase
        .from("egg_types")
        .select("id, name_th, sprite_prefix")
        .eq("is_obtainable", true)
        .order("id", { ascending: true }),
      supabase
        .from("pets")
        .select("id, egg_type_id, subline, personality, evolved_at")
        .eq("user_id", user.id)
        .eq("is_active", false)
        .order("evolved_at", { ascending: true }),
    ]);

    eggTypes = eggTypeRows ?? [];

    for (const p of petRows ?? []) {
      if (!p.egg_type_id || !p.subline || !p.personality) continue;
      const key = `${p.egg_type_id}_${p.subline}_${p.personality}`;
      if (!firstPetIdByCombo.has(key)) {
        firstPetIdByCombo.set(key, p.id);
      }
    }
  }

  const sections: CollectionSection[] = eggTypes.map((eggType) => {
    const slots: CollectionSlot[] = [];
    for (const subline of SUBLINE_ORDER) {
      for (const personality of PERSONALITY_ORDER) {
        const key = `${eggType.id}_${subline}_${personality}`;
        const petId = firstPetIdByCombo.get(key) ?? null;
        const { base, name } = getSpeciesNameParts(eggType.sprite_prefix, subline, personality);
        slots.push({
          key,
          imagePath: getPetImagePath(eggType.sprite_prefix, 4, subline, personality),
          speciesName: getSpeciesName(eggType.sprite_prefix, 4, subline, personality, eggType.name_th),
          unlocked: petId !== null,
          petId,
          base,
          name,
        });
      }
    }
    return { eggTypeId: eggType.id, eggNameTh: eggType.name_th, slots };
  });

  const totalSlots = sections.length * 6;
  const totalUnlocked = sections.reduce(
    (sum, section) => sum + section.slots.filter((s) => s.unlocked).length,
    0
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <div>
        <h1 className="text-2xl font-bold text-gold-hi">สมุดสะสม</h1>
        <p className="text-sm text-text3">Qmon ที่เลี้ยงจนโตเต็มที่และเก็บเข้าสมุดแล้ว</p>
      </div>

      <div>
        <p className="mb-1 text-xs text-text2">
          ความครบสมบูรณ์ {totalUnlocked} / {totalSlots}
        </p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-track">
          <div
            className="h-full bg-amber transition-all"
            style={{ width: totalSlots ? `${(totalUnlocked / totalSlots) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          ยังไม่มีข้อมูลไข่
        </p>
      ) : (
        <CollectionGrid sections={sections} />
      )}
    </main>
  );
}
