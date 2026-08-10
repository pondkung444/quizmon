import { createClient, getUser } from "@/lib/supabase/server";
import { type Subline, type Personality } from "@/lib/evolution";
import { getSpeciesName, getSpeciesNameParts, SENIOR_LINE_ORDER, type PetLine } from "@/lib/petLine";
import { getPetImagePath } from "@/lib/petImage";
import { getGradeBand } from "@/lib/gradeBand";
import SignOutLink from "@/components/SignOutLink";
import CollectionGrid, { type CollectionSection, type CollectionSlot } from "@/components/CollectionGrid";

const JUNIOR_LINE_ORDER: Subline[] = ["math", "science", "balanced"];
const PERSONALITY_ORDER: Personality[] = ["A", "B"];

// ชั้นวางไข่ tier หายาก (นอกกริดหลัก 12 ช่องที่จำกัดแค่ tier="common") — เรียงชั้นด้วยลำดับนี้
// (ไม่ hardcode egg4/egg_rare_01 ที่ไหนเลย กรองจาก tier เท่านั้น เพิ่มไข่ rare ใบที่ 2 หรือ epic
// ในอนาคตไม่ต้องแก้ไฟล์นี้ซ้ำ — tier ที่ไม่อยู่ใน order นี้ เช่น epic ที่ยังไม่มีใช้จริง จะต่อท้าย
// ตามลำดับ id แทน ไม่ throw)
const RARITY_TIER_ORDER = ["rare", "epic", "legendary"];
// หัวข้อชั้น (ฤทธิ์ vs เทพ เป็นคนละชั้นโดยเจตนาตามระบบตั้งชื่อของเกม — ไม่ใช้หัวข้อคลุมเดียวทั้งคู่)
const RARITY_TIER_LABEL: Record<string, string> = {
  rare: "Qmon หายาก",
  epic: "Qmon สุดยอด",
  legendary: "Qmon ในตำนาน",
};
const RARITY_TIER_SUBTITLE: Record<string, string> = {
  rare: "ได้จากการผจญภัย",
  epic: "ได้จากการพิชิตด่านยากสุดของระบบท้าทาย",
  legendary: "ได้จากการเป็นอันดับ 1 ประจำสัปดาห์",
};

export default async function CollectionAlbumPage() {
  const supabase = await createClient();
  const user = await getUser();
  const band = user ? await getGradeBand(user.id) : "junior";
  // สายที่โชว์ในกริดขึ้นกับ band ของ "คนที่ดูหน้านี้ตอนนี้" ไม่ใช่ band ตอนที่ pet ล็อก subline
  // — grade_band เป็น generated column จาก grade_level เด็กแก้ระดับชั้นตัวเองได้ ทำให้ band พลิกได้
  // (ดูหมวด 8.6) pet เก่าที่ subline ไม่อยู่ใน SUBLINE_ORDER ของ band ปัจจุบันจะหาคอมโบไม่เจอใน
  // firstPetIdByCombo แล้วไม่โชว์ในกริดเงียบๆ (ไม่ throw เพราะ loop ด้านล่างเรียกฟังก์ชันด้วยค่าจาก
  // SUBLINE_ORDER เองเท่านั้น ไม่เคยส่ง raw pet.subline เข้า getSpeciesName/getPetImagePath ตรงๆ)
  const SUBLINE_ORDER: PetLine[] = band === "senior" ? SENIOR_LINE_ORDER : JUNIOR_LINE_ORDER;

  let eggTypes: { id: string; name_th: string; sprite_prefix: string; tier: string }[] = [];
  // combo (eggTypeId_subline_personality) -> id ของ "ตัวแรกที่เก็บ" (evolved_at เก่าสุด)
  // ใช้ตัวนี้ตัดสินทั้ง unlock และลิงก์ไปหน้า /collection/[petId] — ตัวซ้ำที่เก็บทีหลังยังอยู่ใน
  // DB ครบ แค่ไม่โผล่ในกริดซ้ำ (ดูโจทย์ข้อ 4 — deferred เรื่อง UI โชว์ตัวซ้ำไว้ก่อน)
  const firstPetIdByCombo = new Map<string, string>();

  if (user) {
    const [{ data: eggTypeRows }, { data: petRows }] = await Promise.all([
      supabase
        .from("egg_types")
        .select("id, name_th, sprite_prefix, tier")
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

  // สร้าง section เดียวจาก eggType หนึ่งแถว (ล็อกจำนวนช่อง/ลำดับตาม SUBLINE_ORDER/PERSONALITY_ORDER
  // เดิมทุกประการ) — แยกเป็นฟังก์ชันเพื่อ reuse ทั้งกริดหลัก (tier=common) และชั้นวางไข่หายาก
  // ด้านล่าง โดยไม่ต้องก็อปลอจิกเดิมซ้ำ ไม่ได้เปลี่ยนพฤติกรรมของกริดหลักแต่อย่างใด
  function buildSection(eggType: { id: string; name_th: string; sprite_prefix: string }): CollectionSection {
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
          eggTypeId: eggType.id,
          subline,
          personality,
        });
      }
    }
    return { eggTypeId: eggType.id, eggNameTh: eggType.name_th, slots };
  }

  // กริดหลัก — เฉพาะ tier="common" เท่านั้น (12 ช่องเป๊ะ: 2 egg type × 3 สาย × 2 บุคลิก) ไข่ tier อื่น
  // (rare/legendary/epic ในอนาคต) ไม่เคยอยู่ในกริดนี้ — ไปอยู่ที่ชั้นวางแยกด้านล่างแทน
  const commonEggTypes = eggTypes.filter((eggType) => eggType.tier === "common");
  const sections: CollectionSection[] = commonEggTypes.map(buildSection);

  // ชั้นวางไข่ tier หายาก — จัดกลุ่มตาม tier แต่ละ tier มีหัวข้อของตัวเอง (RARITY_TIER_LABEL) ไม่ใช้
  // หัวข้อคลุมเดียวรวมทุก tier เพราะฤทธิ์(rare)/เทพ(legendary) เป็นคนละชั้นโดยเจตนา — เรียงกลุ่มตาม
  // RARITY_TIER_ORDER (tier ที่ไม่อยู่ในลิสต์ เช่น epic ที่ยังไม่มีใช้จริง จะต่อท้ายตามลำดับ id แทน
  // ไม่ throw ใช้ tier เป็น label ตรงๆ ไปก่อน) แต่ละ egg type ยังเป็น section ของตัวเองใน group
  // (เผื่อมีไข่ rare ใบที่ 2 ในอนาคต จะมาอยู่ใต้หัวข้อ "Qmon หายาก" เดียวกัน)
  const nonCommonEggTypes = eggTypes
    .filter((eggType) => eggType.tier !== "common")
    .sort((a, b) => {
      const ai = RARITY_TIER_ORDER.indexOf(a.tier);
      const bi = RARITY_TIER_ORDER.indexOf(b.tier);
      return (ai === -1 ? RARITY_TIER_ORDER.length : ai) - (bi === -1 ? RARITY_TIER_ORDER.length : bi);
    });

  const rarityGroups: { tier: string; label: string; sections: CollectionSection[] }[] = [];
  for (const eggType of nonCommonEggTypes) {
    const section = { ...buildSection(eggType), subtitle: RARITY_TIER_SUBTITLE[eggType.tier] };
    let group = rarityGroups.find((g) => g.tier === eggType.tier);
    if (!group) {
      group = { tier: eggType.tier, label: RARITY_TIER_LABEL[eggType.tier] ?? eggType.tier, sections: [] };
      rarityGroups.push(group);
    }
    group.sections.push(section);
  }

  const totalSlots = sections.length * SUBLINE_ORDER.length * PERSONALITY_ORDER.length;
  const totalUnlocked = sections.reduce(
    (sum, section) => sum + section.slots.filter((s) => s.unlocked).length,
    0
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <div>
        <h1 className="text-2xl font-bold text-gold-hi">สมุดสะสม</h1>
        <p className="text-sm text-text3">Qmon ที่เลี้ยงจนโตเต็มที่และเก็บเข้าฟาร์มแล้ว</p>
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

      {rarityGroups.map((group, index) => (
        <div
          key={group.tier}
          className={`flex flex-col gap-6 ${index === 0 ? "border-t border-border pt-6" : ""}`}
        >
          <h2 className="text-lg font-bold text-gold-hi">{group.label}</h2>
          <CollectionGrid sections={group.sections} />
        </div>
      ))}
    </main>
  );
}
