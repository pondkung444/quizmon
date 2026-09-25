import test from "node:test";
import { check, createFocusDb, PET1, PET1_OLD, ROOM2, S1, S2 } from "./harness.ts";

// คาบตั้งใจ Phase 3 — EXP: ก้อนละ 10, เพดาน 50/วัน (เวลาไทย), เข้าตัวที่กำลังเลี้ยง, แจกครั้งเดียวต่อรอบ

test("focus mode phase 3: exp award, daily cap, all end paths", async () => {
  const h = await createFocusDb();
  const { db, hb, sig, tick, part, lastEvent, end } = h;
  const petExp = async (id: string) =>
    (await db.query<{ exp: number; exp_today: number }>(`select exp, exp_today from public.pets where id=$1`, [id])).rows[0];
  try {
    // --- รอบ 1: 2 ก้อน = 20 EXP
    await h.launch();
    await sig(S1, "resume");
    await sig(S2, "resume");
    await tick(1205);
    let r = await hb(S1);
    check("2 blocks → pending 20, cap left 50", r.completed_blocks === 2 && r.exp_pending === 20 && r.exp_cap_left === 50, r);
    await hb(S2);

    r = await end();
    check("end summary includes exp_awarded", r.exp_awarded === 20, r);
    let p = await part(S1);
    check("S1 awarded 20 to active pet", p.exp_awarded === 20 && p.exp_pet_id === PET1 && p.exp_awarded_at !== null, p);
    const pet = await petExp(PET1);
    check("active pet exp +20, exp_today untouched", pet.exp === 120 && pet.exp_today === 0, pet);
    check("inactive pet untouched", (await petExp(PET1_OLD)).exp === 999);
    check("exp_award event logged", (await lastEvent(S1, "exp_award"))?.meta?.awarded === 20);
    p = await part(S2);
    check("no active pet → 0 EXP, still decided", p.exp_awarded === 0 && p.exp_pet_id === null && p.exp_awarded_at !== null, p);

    r = await end();
    check("second end is no-op for EXP", r.already_ended === true && (await petExp(PET1)).exp === 120, r);

    // --- รอบ 2: 4 ก้อน = 40 แต่เหลือเพดาน 30
    await h.launch();
    await sig(S1, "resume");
    await tick(2405);
    r = await hb(S1);
    check("4 blocks → pending capped at 30", r.completed_blocks === 4 && r.exp_pending === 30 && r.exp_cap_left === 30, r);
    await end();
    check("round 2 awarded 30 (cap)", (await part(S1)).exp_awarded === 30 && (await petExp(PET1)).exp === 150);

    // --- รอบ 3: ครบเพดานแล้ว → 0 แต่บันทึกว่าได้ก้อน
    await h.launch();
    await sig(S1, "resume");
    await tick(605);
    r = await hb(S1);
    check("cap reached → pending 0", r.exp_pending === 0 && r.exp_cap_left === 0, r);
    await end();
    const ev = await lastEvent(S1, "exp_award");
    check("capped round logs earned 10 awarded 0", ev?.meta?.earned === 10 && ev?.meta?.awarded === 0, ev);
    check("capped round still records the active pet", (await part(S1)).exp_pet_id === PET1);
    check("pet exp unchanged after cap", (await petExp(PET1)).exp === 150);

    // --- วันใหม่ (เลื่อนรอบก่อนๆ ไปเมื่อวาน) → เพดานกลับมา
    await db.exec(`update public.classroom_focus_participants set exp_awarded_at = exp_awarded_at - interval '1 day' where exp_awarded_at is not null`);
    await h.launch();
    await sig(S1, "resume");
    await tick(605);
    await end();
    check("new day → award again", (await part(S1)).exp_awarded === 10 && (await petExp(PET1)).exp === 160);

    // --- ปิดห้องกลางคาบ → trigger ก็แจก EXP
    await h.launch(ROOM2);
    await sig(S1, "resume");
    await tick(605);
    await db.exec(`update public.classroom_sessions set status='ended', current_activity=null where id='${ROOM2}'`);
    p = await part(S1);
    check("class close awards via finalize", p.exp_awarded === 10 && (await petExp(PET1)).exp === 170, p);

    // --- สิทธิ์
    const g = (await db.query<Record<"a" | "b", boolean>>(`select
      has_function_privilege('authenticated','public.focus_award_exp(uuid,uuid,timestamptz)','execute') a,
      has_function_privilege('authenticated','public.focus_exp_used_on(uuid,date,uuid)','execute') b`)).rows[0];
    check("award/cap helpers not callable by clients", g.a === false && g.b === false, g);
  } finally {
    await db.close();
  }
});
