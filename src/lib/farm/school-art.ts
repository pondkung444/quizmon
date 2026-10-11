export function schoolArt(level: number) {
  return Number.isInteger(level) && level >= 2 && level <= 4
    ? `/farm/qmon-school-l${level}-v1.png`
    : "/farm/qmon-school-l1-v1.webp";
}
