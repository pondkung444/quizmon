"use server";
import { revalidatePath } from "next/cache";
import { changeFarmLayout } from "@/lib/farm/layout-server";
import type { BridgeOrientation } from "@/lib/farm/layout";
export async function saveFarmLayout(
  operation: "move" | "place",
  id: string,
  x: number,
  y: number,
  orientation: BridgeOrientation = 0,
) {
  const tiles = await changeFarmLayout(operation, id, x, y, orientation);
  revalidatePath("/collection");
  revalidatePath("/collection/layout");
  revalidatePath("/collection/projects");
  revalidatePath("/collection/school");
  return tiles;
}
