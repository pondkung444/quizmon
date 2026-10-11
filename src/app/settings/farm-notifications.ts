"use server";
import { farmNotificationPreference } from "@/lib/farm/attention-server";
import { revalidatePath } from "next/cache";
export async function updateFarmNotifications(enabled: boolean) {
  await farmNotificationPreference(enabled);
  revalidatePath("/settings");
}
