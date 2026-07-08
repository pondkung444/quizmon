import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { Subline, Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import SignOutLink from "@/components/SignOutLink";

const SUBLINE_ORDER: Subline[] = ["math", "science", "balanced"];
const PERSONALITY_ORDER: Personality[] = ["A", "B"];

const SUBLINE_LABEL: Record<Subline, string> = {
  math: "สายคณิต",
  science: "สายวิทย์",
  balanced: "สายสมดุล",
};

type Slot = {
  key: string;
  eggTypeId: string;
  subline: Subline;
  personality: Personality;
  imagePath: string;
  unlocked: boolean;
};

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let eggTypes: { id: string; name_th: string; sprite_prefix: string }[] = [];
  let unlockedKeys = new Set<string>();

  if (user) {
    const [{ data: eggTypeRows }, { data: petRows }] = await Promise.all([
      supabase
        .from("egg_types")
        .select("id, name_th, sprite_prefix")
        .eq("is_obtainable", true)
        .order("id", { ascending: true }),
      supabase
        .from("pets")
        .select("egg_type_id, subline, personality")
        .eq("user_id", user.id)
        .eq("is_active", false),
    ]);

    eggTypes = eggTypeRows ?? [];
    unlockedKeys = new Set(
      (petRows ?? [])
        .filter((p) => p.egg_type_id && p.subline && p.personality)
        .map((p) => `${p.egg_type_id}_${p.subline}_${p.personality}`)
    );
  }

  const sections = eggTypes.map((eggType) => {
    const slots: Slot[] = [];
    for (const subline of SUBLINE_ORDER) {
      for (const personality of PERSONALITY_ORDER) {
        const key = `${eggType.id}_${subline}_${personality}`;
        slots.push({
          key,
          eggTypeId: eggType.id,
          subline,
          personality,
          imagePath: getPetImagePath(eggType.sprite_prefix, 4, subline, personality),
          unlocked: unlockedKeys.has(key),
        });
      }
    }
    return { eggType, slots };
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
        sections.map(({ eggType, slots }) => (
          <section key={eggType.id} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-gold-hi">{eggType.name_th}</h2>
            <div className="grid grid-cols-3 gap-3">
              {slots.map((slot) => (
                <div
                  key={slot.key}
                  className={`relative flex aspect-[1/1.08] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl p-2 ${
                    slot.unlocked
                      ? "border border-gold bg-track"
                      : "border border-dashed border-border bg-card"
                  }`}
                >
                  {slot.unlocked ? (
                    <Image
                      src={slot.imagePath}
                      alt={`${eggType.name_th} ${SUBLINE_LABEL[slot.subline]} ${slot.personality}`}
                      width={90}
                      height={90}
                      className="h-16 w-16 object-contain"
                    />
                  ) : (
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      <div
                        className="h-full w-full bg-gold-dim"
                        style={{
                          maskImage: `url(${slot.imagePath})`,
                          WebkitMaskImage: `url(${slot.imagePath})`,
                          maskSize: "contain",
                          WebkitMaskSize: "contain",
                          maskRepeat: "no-repeat",
                          WebkitMaskRepeat: "no-repeat",
                          maskPosition: "center",
                          WebkitMaskPosition: "center",
                        }}
                      />
                      <span className="absolute text-lg font-bold text-text3">?</span>
                    </div>
                  )}
                  <p className="text-[10px] text-text3">
                    {slot.unlocked
                      ? `${SUBLINE_LABEL[slot.subline]} · ${slot.personality}`
                      : "ยังไม่ปลดล็อก"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
