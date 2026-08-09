import Link from "next/link";
import Image from "next/image";
import { createClient, getUser } from "@/lib/supabase/server";
import { type Subline, type Personality } from "@/lib/evolution";
import { getSpeciesName } from "@/lib/petLine";
import { getPetImagePath } from "@/lib/petImage";
import SignOutLink from "@/components/SignOutLink";

type EggTypeJoin = { sprite_prefix: string; name_th: string };

function pickEggType(joined: EggTypeJoin | EggTypeJoin[] | null): EggTypeJoin | null {
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

// หน้าฟาร์ม — Qmon ทุกตัวที่เลี้ยงจนโตเต็มที่และเก็บเข้าฟาร์มแล้ว (ตัวซ้ำคอมโบเดียวกันโชว์ครบทุกตัว
// ไม่ dedupe แบบ /collection/album ที่โชว์แค่ตัวแรกต่อคอมโบเป็นสมุดสะสม — ฟาร์มคือ "ตัวจริงทุกตัวที่มี")
export default async function CollectionFarmPage() {
  const supabase = await createClient();
  const user = await getUser();

  const pets: {
    id: string;
    nickname: string | null;
    imagePath: string;
    speciesName: string;
  }[] = [];

  if (user) {
    const { data: petRows } = await supabase
      .from("pets")
      .select("id, nickname, subline, personality, evolved_at, egg_types(sprite_prefix, name_th)")
      .eq("user_id", user.id)
      .eq("stage", 4)
      .eq("is_active", false)
      .order("evolved_at", { ascending: false });

    for (const row of petRows ?? []) {
      const eggType = pickEggType(row.egg_types as EggTypeJoin | EggTypeJoin[] | null);
      if (!eggType || !row.subline || !row.personality) continue;
      try {
        pets.push({
          id: row.id,
          nickname: row.nickname,
          imagePath: getPetImagePath(
            eggType.sprite_prefix,
            4,
            row.subline as Subline,
            row.personality as Personality
          ),
          speciesName: getSpeciesName(
            eggType.sprite_prefix,
            4,
            row.subline as Subline,
            row.personality as Personality,
            eggType.name_th
          ),
        });
      } catch (err) {
        console.error("CollectionFarmPage: skip pet with bad data", row.id, err);
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gold-hi">ฟาร์ม</h1>
          <p className="text-sm text-text3">Qmon ทุกตัวที่เลี้ยงจนโตเต็มที่และเก็บเข้าฟาร์มแล้ว</p>
        </div>
        <Link
          href="/collection/album"
          className="shrink-0 rounded-xl border border-gold-dim bg-card px-3 py-2 text-xs font-bold text-gold-hi transition active:scale-95"
        >
          ดูสมุดสะสม
        </Link>
      </div>

      {pets.length === 0 ? (
        <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          ยังไม่มี Qmon ในฟาร์ม — เลี้ยงจนโตเต็มที่แล้วเก็บเข้าฟาร์มดูสิ
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {pets.map((pet) => (
            <Link
              key={pet.id}
              href={`/collection/${pet.id}`}
              className="flex aspect-[1/1.08] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-gold bg-track p-2 text-center transition active:scale-95"
            >
              <Image
                src={pet.imagePath}
                alt={pet.speciesName}
                width={90}
                height={90}
                className="h-16 w-16 object-contain"
              />
              <p className="w-full truncate text-[11px] font-bold text-gold-hi">
                {pet.nickname ?? pet.speciesName}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
