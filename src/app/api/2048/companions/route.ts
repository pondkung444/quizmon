import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forestCompanion, ownedForestPets } from "@/lib/forest2048/companions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "เข้าสู่ระบบเพื่อเลือก Qmon ของคุณ" }, { status: 401, headers });
    const pets = await ownedForestPets(supabase, user.id);
    const companions = pets.map(pet => {
      try { return forestCompanion(pet); }
      catch (error) {
        return { id: pet.id, name: pet.nickname || "Qmon", stage: pet.stage,
          disabled: true, reason: error instanceof Error ? error.message : "ข้อมูลคู่หูยังไม่ครบ" };
      }
    });
    return NextResponse.json({ accountId: user.id, companions }, { headers });
  } catch {
    return NextResponse.json({ error: "โหลดคู่หูไม่สำเร็จ กรุณาลองใหม่" }, { status: 503, headers });
  }
}
