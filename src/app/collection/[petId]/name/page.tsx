import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { type Subline, type Personality } from "@/lib/evolution";
import { getSpeciesName } from "@/lib/petLine";
import SignOutLink from "@/components/SignOutLink";
import EditNicknameForm from "@/components/EditNicknameForm";

export default async function EditNicknamePage({
  params,
}: {
  params: Promise<{ petId: string }>;
}) {
  const { petId } = await params;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) notFound();

  const { data: pet } = await supabase
    .from("pets")
    .select("nickname, stage, subline, personality, egg_types(sprite_prefix, name_th)")
    .eq("id", petId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pet || pet.stage !== 4 || !pet.subline || !pet.personality) notFound();

  const eggType = Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types;
  if (!eggType) notFound();

  const speciesName = getSpeciesName(
    eggType.sprite_prefix,
    4,
    pet.subline as Subline,
    pet.personality as Personality,
    eggType.name_th
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center gap-6 p-6 pb-24">
      <SignOutLink />
      <Link
        href={`/collection/${petId}`}
        className="self-start text-sm text-text3 transition hover:text-gold-hi"
      >
        ← กลับ
      </Link>

      <div className="text-center">
        <h1 className="text-xl font-bold text-gold-hi">แก้ไขชื่อ</h1>
        <p className="text-sm text-text3">{speciesName}</p>
      </div>

      <EditNicknameForm petId={petId} currentNickname={pet.nickname ?? speciesName} />
    </main>
  );
}
