"use server";

import { checkProfanity } from "@/lib/moderation";

export async function checkSignupFields(
  username: string,
  school: string
): Promise<{ blocked: boolean; field?: "username" | "school" }> {
  if ((await checkProfanity(username, {})).blocked) {
    return { blocked: true, field: "username" };
  }
  if (school.trim() && (await checkProfanity(school, {})).blocked) {
    return { blocked: true, field: "school" };
  }
  return { blocked: false };
}
