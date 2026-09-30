import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forestCompanion, ownedForestPets } from "@/lib/forest2048/companions";
import { forestQuestions } from "@/lib/forest2048/questions";

const headers = { "Cache-Control": "private, no-store" };

// This endpoint reads an owned pet and returns a run snapshot. It never writes
// counters, EXP, currencies, gear, or the original pet stat snapshot.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403, headers });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.petId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.petId)) {
    return NextResponse.json({ error: "กรุณาเลือกคู่หู" }, { status: 400, headers });
  }
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบอีกครั้ง" }, { status: 401, headers });
    const pets = await ownedForestPets(supabase, user.id, body.petId);
    if (!pets.length) return NextResponse.json({ error: "ไม่พบคู่หูในบัญชีของคุณ" }, { status: 404, headers });
    let companion;
    try { companion = forestCompanion(pets[0]); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ข้อมูลคู่หูยังไม่ครบ" }, { status: 422, headers }); }
    let bank;
    try { bank = await forestQuestions(user.id); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "โหลดคำถามไม่สำเร็จ" }, { status: 503, headers }); }
    return NextResponse.json({ accountId: user.id, companion, ...bank,
      snapshotAt: new Date().toISOString(), formulaVersion: 1 }, { headers });
  } catch {
    return NextResponse.json({ error: "เริ่มการเดินทางไม่สำเร็จ กรุณาลองใหม่" }, { status: 503, headers });
  }
}
