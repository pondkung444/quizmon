import { createClient } from "@/lib/supabase/server";
import { STAGE_EXP_THRESHOLD, type Subline, type Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import { DAILY_EXP_CAP, getTodayInBangkok } from "@/lib/exp";
import SignOutLink from "@/components/SignOutLink";
import PetCard from "@/components/PetCard";

const STAGE_INFO: Record<number, { name: string; description: string }> = {
  1: { name: "ไข่", description: "กำลังรอฟักตัว" },
  2: { name: "ตัวอ่อน", description: "เริ่มเติบโต" },
  3: { name: "วัยเจริญ", description: "เริ่มเห็นสายวิวัฒนาการ" },
  4: { name: "ร่างสมบูรณ์", description: "เติบโตเต็มที่แล้ว" },
};

const SUBLINE_LABEL: Record<string, string> = {
  math: "สายคณิต",
  science: "สายวิทย์",
  balanced: "สายสมดุล",
};

export default async function PetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let pet: {
    nickname: string | null;
    exp: number;
    stage: number;
    subline: string | null;
    personality: string | null;
    stat_hp: number | null;
    stat_atk: number | null;
    stat_def: number | null;
    stat_spd: number | null;
    stat_foc: number | null;
    exp_today: number;
    exp_today_date: string;
    egg_types:
      | { sprite_prefix: string; name_th: string }
      | { sprite_prefix: string; name_th: string }[]
      | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("pets")
      .select(
        "nickname, exp, stage, subline, personality, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, exp_today, exp_today_date, egg_types(sprite_prefix, name_th)"
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    pet = data;
  }

  const exp = pet?.exp ?? 0;
  const stage = pet?.stage ?? 1;
  const stageInfo = STAGE_INFO[stage] ?? STAGE_INFO[1];
  const subline = pet?.subline;
  const personality = pet?.personality;
  const statHp = pet?.stat_hp ?? null;
  const statAtk = pet?.stat_atk ?? null;
  const statDef = pet?.stat_def ?? null;
  const statSpd = pet?.stat_spd ?? null;
  const statFoc = pet?.stat_foc ?? null;

  const nextThreshold = STAGE_EXP_THRESHOLD[stage];
  const progress = nextThreshold ? Math.min(1, Math.max(0, exp / nextThreshold)) : 1;

  const expToday = pet && pet.exp_today_date === getTodayInBangkok() ? pet.exp_today : 0;

  const eggType = pet ? (Array.isArray(pet.egg_types) ? pet.egg_types[0] : pet.egg_types) : null;
  let petImagePath: string | null = null;
  if (eggType) {
    try {
      petImagePath = getPetImagePath(
        eggType.sprite_prefix,
        stage,
        (subline ?? null) as Subline | null,
        (personality ?? null) as Personality | null
      );
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <SignOutLink />
      {pet ? (
        <PetCard
          stage={stage}
          stageName={stageInfo.name}
          stageDescription={stageInfo.description}
          exp={exp}
          nextThreshold={nextThreshold}
          progress={progress}
          nickname={pet.nickname}
          petImagePath={petImagePath}
          sublineLabel={subline ? SUBLINE_LABEL[subline] ?? subline : null}
          personality={personality ?? null}
          eggNameTh={eggType?.name_th ?? null}
          statHp={statHp}
          statAtk={statAtk}
          statDef={statDef}
          statSpd={statSpd}
          statFoc={statFoc}
          expToday={expToday}
          dailyCap={DAILY_EXP_CAP}
        />
      ) : (
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          ยังไม่มีสัตว์ที่กำลังเลี้ยงอยู่ — ไปที่คลังไข่เพื่อฟักไข่ใบแรก
        </div>
      )}
    </main>
  );
}
