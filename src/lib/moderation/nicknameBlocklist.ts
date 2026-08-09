const BLOCKLIST: string[] = [
  // TODO: เติมรายการจริงตรงนี้ — normalize เป็น lowercase ไม่มีช่องว่างก่อนเทียบ
];

export function isBlockedNickname(input: string): boolean {
  const normalized = input.toLowerCase().replace(/\s+/g, "");
  return BLOCKLIST.some((word) => normalized.includes(word));
}
