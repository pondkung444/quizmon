import "server-only";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INITIAL_FARM, type FarmTile } from "./world";
import type { BridgeOrientation } from "./layout";
export async function loadFarmLayout(): Promise<FarmTile[]> {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  const { data, error } = await createAdminClient().rpc("farm_layout_tiles", {
    p_user: user.id,
  });
  if (error) throw Error("โหลดผังฟาร์มไม่สำเร็จ");
  return data as FarmTile[];
}
export async function loadFarmLayoutIfAvailable(): Promise<FarmTile[] | null> {
  const user = await getUser();
  if (!user) return [...INITIAL_FARM];
  const { data, error } = await createAdminClient().rpc("farm_layout_tiles", {
    p_user: user.id,
  });
  if (error && ["42883", "PGRST202"].includes(error.code)) return null;
  if (error) throw Error("โหลดผังฟาร์มไม่สำเร็จ");
  return data as FarmTile[];
}
export async function changeFarmLayout(
  operation: "move" | "place",
  id: string,
  x: number,
  y: number,
  orientation: BridgeOrientation = 0,
) {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  if (
    !["move", "place"].includes(operation) ||
    typeof id !== "string" ||
    id.length > 80 ||
    ![x, y].every((n) => Number.isInteger(n) && Math.abs(n) <= 10000) ||
    ![0, 1].includes(orientation)
  )
    throw Error("เลือกตำแหน่งและทิศให้ถูกต้อง");
  if (
    operation === "place" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw Error("เลือกโครงการของเรา");
  const { data, error } = await createAdminClient().rpc(
    operation === "move" ? "farm_layout_move" : "farm_layout_place",
    { p_user: user.id, p_id: id, p_x: x, p_y: y, p_orientation: orientation },
  );
  if (error)
    throw Error(
      /^(ผัง|ย้าย|เลือก|ตำแหน่ง|งาน|หมุน)/.test(error.message)
        ? error.message
        : "บันทึกผังไม่สำเร็จ ลองอีกครั้งได้",
    );
  return operation === "move" ? (data as FarmTile[]) : await loadFarmLayout();
}
