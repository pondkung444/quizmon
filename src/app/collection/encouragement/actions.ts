"use server";
import { revalidatePath } from "next/cache";
import {
  sendFarmSticker,
  visitPreference,
  farmStickerInbox,
} from "@/lib/farm/social-server";
import type { FarmSticker } from "@/lib/farm/social";
export async function sendSticker(
  owner: string,
  sticker: FarmSticker,
  request: string,
) {
  return sendFarmSticker(owner, sticker, request);
}
export async function saveVisitPreference(enabled: boolean) {
  const r = await visitPreference(enabled);
  revalidatePath("/collection/encouragement");
  return r;
}
export async function readFarmEncouragement() {
  const r = await farmStickerInbox(true);
  revalidatePath("/collection/encouragement");
  return r;
}
