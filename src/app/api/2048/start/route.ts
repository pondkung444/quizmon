import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forestCompanion, ownedForestPets } from "@/lib/forest2048/companions";
import { forestQuestions } from "@/lib/forest2048/questions";
import { createAdminClient } from "@/lib/supabase/admin";
import { newReplay } from "@/lib/forest2048/replay";
import { randomBytes } from "node:crypto";

const headers = { "Cache-Control": "private, no-store" };
export const runtime = 'nodejs';

// This endpoint reads an owned pet and creates a competition snapshot. It never writes
// counters, EXP, currencies, gear, or the original pet stat snapshot.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403, headers });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.petId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.petId)) {
    return NextResponse.json({ error: "กรุณาเลือกคู่หู" }, { status: 400, headers });
  }
  if (body.journeyVersion !== undefined && body.journeyVersion !== 1) {
    return NextResponse.json({ error: "รุ่นการเดินทางไม่รองรับ" }, { status: 400, headers });
  }
  if (body.mechanicsVersion !== undefined && (body.mechanicsVersion !== 1 || body.journeyVersion !== 1)) {
    return NextResponse.json({ error: "รุ่นกลไกไม่รองรับ" }, { status: 400, headers });
  }
  if (body.contentVersion !== undefined && (body.contentVersion !== 1 || body.mechanicsVersion !== 1 || body.journeyVersion !== 1)) {
    return NextResponse.json({ error: "รุ่นเนื้อหาไม่รองรับ" }, { status: 400, headers });
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
    const snapshotAt = new Date().toISOString(), seed = randomBytes(4).readUInt32LE();
    // Tabs loaded before the update still run v3 JavaScript; only refreshed clients request v4.
    const balanceVersion = body.balanceVersion === 4 ? 4 : 3;
    const journey = body.journeyVersion === 1 ? {journeyVersion:1,...(body.mechanicsVersion===1?{mechanicsVersion:1}:{}),...(body.contentVersion===1?{contentVersion:1}:{})} : {endlessVersion:1};
    const engine_state = newReplay({version:3,runeVersion:1,balanceVersion,...journey,relicVersion:1,
      skillVersion:1,accountId:user.id,companion,...bank,snapshotAt,formulaVersion:1,hero:companion.lane,
      seed,routeSeed:seed,room:1,coins:0,relics:[],phase:'battle',revived:false,echo:false,started:Date.now(),history:[]});
    const admin = createAdminClient();
    const {data: created,error: saveError} = await admin.from('forest2048_runs')
      .insert({user_id:user.id,engine_state}).select('id').single();
    if(saveError || !created) throw new Error('บันทึกการเดินทางไม่สำเร็จ');
    return NextResponse.json({ accountId: user.id, companion, ...bank, snapshotAt, formulaVersion: 1,
      competition: {id:created.id,seed}, initial:engine_state }, { headers });
  } catch {
    return NextResponse.json({ error: "เริ่มการเดินทางไม่สำเร็จ กรุณาลองใหม่" }, { status: 503, headers });
  }
}
