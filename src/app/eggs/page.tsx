import { createClient, getUser } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import SignOutLink from "@/components/SignOutLink";
import EggsClient, { type EggListItem } from "@/components/EggsClient";

export default async function EggsPage() {
  const supabase = await createClient();
  const user = await getUser();

  let eggs: EggListItem[] = [];
  let hasActivePet = false;

  if (user) {
    const [{ data: eggRows }, { data: activePet }] = await Promise.all([
      supabase
        .from("player_eggs")
        .select(
          "id, source, obtained_at, egg_type_id, egg_types(name_th, tier, description, sprite_prefix)"
        )
        .eq("user_id", user.id)
        .is("hatched_at", null)
        .order("obtained_at", { ascending: true }),
      supabase.from("pets").select("id").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
    ]);

    hasActivePet = !!activePet;
    eggs = (eggRows ?? []).map((row) => {
      const eggType = Array.isArray(row.egg_types) ? row.egg_types[0] : row.egg_types;
      return {
        id: row.id,
        source: row.source,
        obtainedAt: row.obtained_at,
        eggTypeId: row.egg_type_id,
        nameTh: eggType?.name_th ?? row.egg_type_id,
        tier: eggType?.tier ?? "common",
        description: eggType?.description ?? null,
        imagePath: eggType ? getPetImagePath(eggType.sprite_prefix, 1, null, null) : null,
      };
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <div>
        <h1 className="text-2xl font-bold text-gold-hi">คลังไข่</h1>
        <p className="text-sm text-text3">เลือกไข่ใบที่อยากฟักตอนนี้</p>
      </div>
      <EggsClient eggs={eggs} hasActivePet={hasActivePet} />
    </main>
  );
}
