const SLOT_ICON_PATH: Record<"head" | "body" | "feet", string> = {
  head: "/raid/gear/gear-head-mongkol-sian.png",
  body: "/raid/gear/gear-body-mongkol-kai.png",
  feet: "/raid/gear/gear-feet-mongkol-baat.png",
};

// ไอคอนเดียวต่อช่อง ระบายสีด้วย CSS mask แทนมีไฟล์แยกต่อคุณภาพ — ไฟล์ PNG (navy silhouette, alpha
// transparent) ใช้แค่ alpha channel มาทำรูปทรง สีจริงมาจาก background-color ของ span นี้เอง (ดู
// RAID_GEAR_QUALITY_COLOR ใน labels.ts) ช่องว่างส่ง color เป็นโทนมิวต์ของธีมแทน
export default function RaidGearIcon({
  slot,
  color,
  size = 40,
}: {
  slot: "head" | "body" | "feet";
  color: string;
  size?: number;
}) {
  const maskUrl = `url('${SLOT_ICON_PATH[slot]}')`;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: maskUrl,
        maskImage: maskUrl,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
