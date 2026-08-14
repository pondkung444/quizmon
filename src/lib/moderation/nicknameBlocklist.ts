import { containsProfanityLocal } from "@/lib/moderation";

export function isBlockedNickname(input: string): boolean {
  return containsProfanityLocal(input);
}
