export type FarmAttention = {
  help: number;
  place: number;
  unread: number;
  nextAt: string | null;
  serverNow: string;
};
export function hasFarmAttention(
  value: FarmAttention | null,
  elapsedMs = 0,
): boolean {
  if (!value) return false;
  return (
    value.help + value.place + value.unread > 0 ||
    (value.nextAt !== null &&
      Date.parse(value.nextAt) <=
        Date.parse(value.serverNow) + Math.max(0, elapsedMs))
  );
}
