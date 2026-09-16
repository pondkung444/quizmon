export function normalizeFriendName(raw: string): string {
  const name = raw.trim().normalize("NFC");
  if (name.length < 2 || name.length > 40 || /[\x00-\x1f]/.test(name)) {
    throw new Error("กรอกชื่อเล่น 2–40 ตัวอักษร");
  }
  return name;
}
export function friendNamePattern(raw: string): string {
  return normalizeFriendName(raw).replace(/[\\%_]/g, character => `\\${character}`);
}
