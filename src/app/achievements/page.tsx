import { createClient, getUser } from "@/lib/supabase/server";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";
import SignOutLink from "@/components/SignOutLink";
import AchievementCard, { type AchievementCardData, type AchievementTier } from "@/components/AchievementCard";
import AchievementCelebrationModal, { type CelebrationItem } from "@/components/AchievementCelebrationModal";

// เฟส E: หน้าสมุดรวม Achievement เท่านั้น — ไม่รวมหน้าโปรไฟล์/ปักหมุด/หน้าฉลอง (ดู handoff doc)
const LEGACY_ACHIEVEMENT_ID = "legacy_pioneer_tester";

// รวม category ดิบ (19 ค่า) เป็นหัวข้อใหญ่ 10 หัวข้อ — กัน section ที่มีการ์ดเดียวดูโล่งเกินไป
// (ดู achievement-book-page-handoff-2026-08-13-parent-categories.md) แก้ที่ mapping นี้จุดเดียว
// ถ้า category ดิบเปลี่ยน/เพิ่มในอนาคต ไม่ต้องแตะ layout logic ด้านล่าง
const PARENT_CATEGORY: Record<string, string> = {
  "การฝึกและจำนวนคำถาม": "การฝึกและจำนวนคำถาม",
  "ความสม่ำเสมอ — วันสะสม": "ความสม่ำเสมอ",
  "ความสม่ำเสมอ — Streak": "ความสม่ำเสมอ",
  "ความแม่นยำ — ตอบถูกสะสม": "ความแม่นยำ",
  "ความแม่นยำ — Perfect Daily": "ความแม่นยำ",
  "การเลี้ยงและวิวัฒนาการ": "การเลี้ยงและวิวัฒนาการ",
  "สเตตัส Qmon — สายสมดุล": "สเตตัส Qmon",
  "สเตตัส Qmon — ชนเพดาน": "สเตตัส Qmon",
  "การสะสม — ฟาร์ม": "การสะสม",
  "การสะสม — วิวัฒนาการ": "การสะสม",
  "Adventure — จำนวนสำเร็จ": "Adventure",
  "Adventure — การค้นพบ": "Adventure",
  "อุปกรณ์ — สะสม": "อุปกรณ์",
  "อุปกรณ์ — สวมใส่": "อุปกรณ์",
  "อุปกรณ์ — คุณภาพ": "อุปกรณ์",
  "Challenge — ผู้พิชิต": "Challenge",
  "Challenge — ความชำนาญ": "Challenge",
  "เกียรติยศ — Weekly Leaderboard": "เกียรติยศ",
  "Legacy — ผู้ทดสอบ": "Legacy", // ซ่อนอยู่แล้วตาม spec เดิม ไม่มีทางโผล่ใน visibleDefs ถ้าไม่ eligible
};

// sub-label ของแต่ละช่วงย่อยในหัวข้อใหญ่ = ท้ายคำของ category ดิบ ตัด "หัวข้อใหญ่ — " ออก
// (ไม่ hardcode ข้อความใหม่ ตัดจาก string ที่มีอยู่แล้วพอ) ถ้าไม่มี " — " เลยคืน category ดิบทั้งอัน
function subLabelFor(rawCategory: string): string {
  const sepIndex = rawCategory.indexOf(" — ");
  return sepIndex === -1 ? rawCategory : rawCategory.slice(sepIndex + 3);
}

type AchievementDefRow = {
  id: string;
  category: string;
  name: string;
  condition_text: string;
  tier: AchievementTier;
  image_file: string;
  sort_order: number;
  progress_metric: string | null;
  progress_target: number | null;
};

type UserAchievementRow = {
  achievement_id: string;
  earned_at: string;
  pet_id: string | null;
  pet_name_snapshot: string | null;
  celebrated_at: string | null;
};

// ลำดับฉลอง: Crown -> Gold -> Silver -> Bronze (สรุปจากปอนด์แล้ว ไม่ใช่ค่า default ของ enum ใดๆ)
const TIER_CELEBRATION_ORDER: Record<AchievementTier, number> = { Crown: 1, Gold: 2, Silver: 3, Bronze: 4 };

function formatBangkokDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

export default async function AchievementsPage() {
  const user = await getUser();

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูสมุด Achievement
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  // ต้องเรียกก่อน query อื่นทุกครั้ง (idempotent) — จุดเดียวที่ปลดล็อกเหรียญตามกติกาเฟส 1
  await supabase.rpc("evaluate_achievements", { p_user_id: user.id });

  const [{ data: defRows }, { data: earnedRows }, { data: progressRows }, { data: eligibilityRow }] =
    await Promise.all([
      supabase
        .from("achievement_definitions")
        .select("id, category, name, condition_text, tier, image_file, sort_order, progress_metric, progress_target")
        .order("sort_order", { ascending: true }),
      supabase
        .from("user_achievements")
        .select("achievement_id, earned_at, pet_id, pet_name_snapshot, celebrated_at")
        .eq("user_id", user.id),
      supabase.rpc("get_achievement_progress", { p_user_id: user.id }),
      supabase.from("achievement_tester_eligibility").select("eligible").eq("user_id", user.id).maybeSingle(),
    ]);

  const definitions = (defRows ?? []) as AchievementDefRow[];
  const earnedList = (earnedRows ?? []) as UserAchievementRow[];
  const progressList = (progressRows ?? []) as { metric: string; current_value: number }[];
  const eligible = eligibilityRow?.eligible === true;

  const earnedMap = new Map(earnedList.map((row) => [row.achievement_id, row]));
  const progressMap = new Map(progressList.map((row) => [row.metric, row.current_value]));

  // ซ่อนการ์ด legacy ทั้งใบ (รวมนับใน header) ถ้าบัญชีนี้ไม่มีสิทธิ์
  const visibleDefs = definitions.filter((def) => def.id !== LEGACY_ACHIEVEMENT_ID || eligible);
  const visibleDefsById = new Map(visibleDefs.map((def) => [def.id, def]));

  // ห้ามใช้ return value ของ evaluate_achievements() ตัดสินว่าอันไหนต้องฉลอง (พลาดถาวรถ้าปิด
  // เบราว์เซอร์ก่อนโมดัลทัน) — ใช้ celebrated_at is null จาก user_achievements ที่ query จริงแทน
  // กรองผ่าน visibleDefsById ด้วยเพื่อไม่ฉลองการ์ด legacy ที่ถูกซ่อนไปแล้ว
  const uncelebrated: CelebrationItem[] = earnedList
    .filter((row) => row.celebrated_at === null && visibleDefsById.has(row.achievement_id))
    .map((row) => {
      const def = visibleDefsById.get(row.achievement_id)!;
      return { id: def.id, name: def.name, tier: def.tier, conditionText: def.condition_text, imageFile: def.image_file };
    })
    .sort((a, b) => TIER_CELEBRATION_ORDER[a.tier] - TIER_CELEBRATION_ORDER[b.tier]);

  // เหรียญที่ได้แล้วแต่ไม่มี pet_name_snapshot (ข้อมูลเก่า) ต้อง resolve ชื่อสายพันธุ์สดจาก pets ปัจจุบัน
  const petIdsNeedingName = Array.from(
    new Set(
      visibleDefs
        .map((def) => earnedMap.get(def.id))
        .filter((row): row is UserAchievementRow => !!row && !row.pet_name_snapshot && !!row.pet_id)
        .map((row) => row.pet_id as string)
    )
  );

  const resolvedPetNames = new Map<string, string>();
  if (petIdsNeedingName.length > 0) {
    const { data: petRows } = await supabase
      .from("pets")
      .select("id, stage, subline, personality, egg_types(sprite_prefix, name_th)")
      .in("id", petIdsNeedingName);

    for (const pet of petRows ?? []) {
      const eggType = Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types;
      if (!eggType) continue;
      try {
        const name = getSpeciesName(
          eggType.sprite_prefix,
          pet.stage,
          pet.subline as Subline | null,
          pet.personality as Personality | null,
          eggType.name_th
        );
        resolvedPetNames.set(pet.id, name);
      } catch {
        // ข้อมูล pet ไม่ครบพอ resolve ชื่อสด (เช่นโครงสร้างข้อมูลเก่า) — ข้ามไป ไม่โชว์ชื่อแทนที่จะพังทั้งหน้า
      }
    }
  }

  const totalCount = visibleDefs.length;
  const earnedCount = visibleDefs.filter((def) => earnedMap.has(def.id)).length;

  // โครงสร้าง 2 ชั้น: หัวข้อใหญ่ (parent) -> ช่วงย่อยตาม category ดิบ (subGroup) -> การ์ด
  // Map รักษาลำดับ insertion เอง — เพราะ visibleDefs เรียงตาม sort_order แล้ว หัวข้อใหญ่/ช่วงย่อยที่
  // เจอก่อนจะอยู่ก่อนโดยอัตโนมัติ ตรงกับกติกา "เรียงตาม sort_order ของการ์ดแรกที่เจอ" — ช่วงย่อยไม่ต้อง
  // sort ใหม่เพราะ category ดิบเดิมเรียงต่อกันเป็นช่วงอยู่แล้วในข้อมูล (เทียบ rawCategory ของกลุ่มท้ายสุด
  // พอ ไม่ต้องหา group เดิมข้ามลำดับ)
  type SubGroup = { rawCategory: string; cards: AchievementCardData[] };
  type ParentSection = { parent: string; subGroups: SubGroup[] };
  const sections = new Map<string, ParentSection>();
  for (const def of visibleDefs) {
    const earnedRow = earnedMap.get(def.id);
    const currentValue = def.progress_metric ? progressMap.get(def.progress_metric) ?? 0 : null;

    let earnedByLabel: string | null = null;
    if (earnedRow) {
      if (earnedRow.pet_name_snapshot) {
        earnedByLabel = `โดย ${earnedRow.pet_name_snapshot}`;
      } else if (earnedRow.pet_id) {
        const resolved = resolvedPetNames.get(earnedRow.pet_id);
        earnedByLabel = resolved ? `โดย ${resolved}` : null;
      }
    }

    const card: AchievementCardData = {
      id: def.id,
      name: def.name,
      conditionText: def.condition_text,
      tier: def.tier,
      imageFile: def.image_file,
      progressMetric: def.progress_metric,
      progressTarget: def.progress_target,
      currentValue,
      earned: !!earnedRow,
      earnedAtLabel: earnedRow ? formatBangkokDate(earnedRow.earned_at) : null,
      earnedByLabel,
    };

    const parent = PARENT_CATEGORY[def.category] ?? def.category;
    let section = sections.get(parent);
    if (!section) {
      section = { parent, subGroups: [] };
      sections.set(parent, section);
    }
    const lastSubGroup = section.subGroups[section.subGroups.length - 1];
    if (lastSubGroup && lastSubGroup.rawCategory === def.category) {
      lastSubGroup.cards.push(card);
    } else {
      section.subGroups.push({ rawCategory: def.category, cards: [card] });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <AchievementCelebrationModal items={uncelebrated} />
      <SignOutLink />
      <div>
        <h1 className="text-2xl font-bold text-gold-hi">สมุดรวม Achievement</h1>
        <p className="mt-1 text-sm text-text3">
          {earnedCount} / {totalCount} เหรียญ
        </p>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-track">
          <div
            className="h-full bg-amber transition-all"
            style={{ width: totalCount ? `${(earnedCount / totalCount) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {Array.from(sections.values()).map(({ parent, subGroups }) => (
        <section key={parent} className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-gold-hi">{parent}</h2>
          <div className="flex flex-col gap-4">
            {subGroups.map((subGroup) => (
              <div key={subGroup.rawCategory} className="flex flex-col gap-2">
                {subGroups.length > 1 && (
                  <p className="text-xs font-semibold text-text3">{subLabelFor(subGroup.rawCategory)}</p>
                )}
                <div className="flex flex-col gap-2">
                  {subGroup.cards.map((card) => (
                    <AchievementCard key={card.id} data={card} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
