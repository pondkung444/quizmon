"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveRosterPet, type ClassroomRosterRow } from "@/lib/classroom/roster";
import { createClient } from "@/lib/supabase/client";
import { toCentralRoster, type CentralRoster, type ResolvePet } from "./centralRoster";
import { createRosterLoader } from "./rosterLoad";
import { teacherRpc } from "./rpc";

// resolveRosterPet อ่านเฉพาะฟิลด์ pet_* — รับ RosterPetFields แล้วแปลงชนิดตรงนี้จุดเดียว
const resolveFromFields: ResolvePet = (f) => resolveRosterPet(f as ClassroomRosterRow);

/**
 * โหลดรายชื่อ Qmon สองทีมสำหรับจอกลาง (ครูเท่านั้น: get_team_battle_setup + get_classroom_roster)
 * - โหลดครั้งเดียวเมื่อ enabled เป็นจริง (เกมพ้น setup แล้ว) — ไม่รับ realtime/membersVersion เลย
 * - โหลดไม่สำเร็จ → ลองใหม่ 1 ครั้งหลัง ~3 วิ แล้วหยุด; ล้มเหลวทั้งสองรอบ = null เงียบๆ (จอเล่นต่อได้ แถวไม่แสดง ไม่ขึ้น error บนจอ TV)
 * - ตรรกะโหลด/retry/StrictMode อยู่ใน createRosterLoader (rosterLoad.ts, มีเทส); hook ทำแค่ต่อ effect
 * ผลลัพธ์เป็น state ก้อนเดียวที่ identity คงที่ → React.memo ของแถวไม่ re-render ตาม tick 250 ms
 */
export function useCentralRoster(sessionId: string, battleId: string, enabled: boolean): CentralRoster | null {
  const [roster, setRoster] = useState<CentralRoster | null>(null);

  // ตัวโหลดอยู่ข้ามรอบ mount→cleanup→mount ของ StrictMode (useMemo คงค่าไว้); สร้างใหม่เมื่อห้อง/เกมเปลี่ยนเท่านั้น
  const loader = useMemo(
    () =>
      createRosterLoader<CentralRoster>({
        fetch: async () => {
          const [setup, r] = await Promise.all([
            teacherRpc.getSetup(battleId),
            createClient().rpc("get_classroom_roster", { p_session_id: sessionId }),
          ]);
          if (r.error || !r.data) throw new Error("roster");
          return toCentralRoster(setup, r.data as ClassroomRosterRow[], resolveFromFields);
        },
        onLoaded: setRoster,
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      }),
    [sessionId, battleId]
  );

  useEffect(() => {
    loader.attach();
    return () => loader.detach();
  }, [loader]);

  useEffect(() => {
    if (enabled) loader.start();
  }, [enabled, loader]);

  return roster;
}
