import Image from "next/image";

// ครอบรูป Qmon avatar เดิมด้วยกรอบโปรไฟล์ผู้พิทักษ์ (frame_definitions.tier) ถ้ามี — ไม่มี tier (หรือ
// ไม่ใช่ 3 ค่าที่รู้จัก) ก็ render children เฉยๆ ไม่มีอะไรเปลี่ยน ปลอดภัยกับทุกจุดที่เรียกใช้
// size คือขนาดกรอบรวม (px) — กรอบพอดีช่อง ไม่ล้นออกนอกกล่อง size×size
// รูปกรอบ 256×256 (public/frame/avatar) มีช่องโปร่งใสสี่เหลี่ยมมุมมนตรงกลาง: ค่า l/t/r/b เป็นพิกเซลบนรูป 256
// รูปสัตว์ (children) วางในช่องนั้น ขยายออก SLOT_BLEED ให้ซ่อนใต้ขอบกรอบ ไม่เห็นรอยต่อ
const IMG = 256;
const SLOT_BLEED = 1.2; // % ของ size ต่อด้าน
const SLOT_RADIUS = 12; // % ของความกว้างช่อง

const FRAMES: Record<string, { src: string; l: number; t: number; r: number; b: number }> = {
  basic: { src: "/frame/avatar/frame_guardian_basic.png", l: 34, t: 41, r: 221, b: 218 },
  mid: { src: "/frame/avatar/frame_guardian_mid.png", l: 34, t: 41, r: 221, b: 217 },
  special: { src: "/frame/avatar/frame_guardian_special.png", l: 38, t: 53, r: 217, b: 214 },
};

export default function PetAvatarFrame({
  tier,
  size,
  children,
}: {
  tier: string | null | undefined;
  size: number;
  children: React.ReactNode;
}) {
  const frame = tier && Object.prototype.hasOwnProperty.call(FRAMES, tier) ? FRAMES[tier] : undefined;
  if (!frame) return <>{children}</>;

  const pct = (px: number) => (px / IMG) * 100;
  const width = pct(frame.r - frame.l);

  return (
    <span className="relative block flex-none" style={{ width: size, height: size }}>
      <span
        className="absolute block overflow-hidden bg-track"
        style={{
          left: `${pct(frame.l) - SLOT_BLEED}%`,
          top: `${pct(frame.t) - SLOT_BLEED}%`,
          width: `${width + SLOT_BLEED * 2}%`,
          height: `${pct(frame.b - frame.t) + SLOT_BLEED * 2}%`,
          borderRadius: `${SLOT_RADIUS}%`,
        }}
      >
        {children}
      </span>
      <Image
        src={frame.src}
        alt=""
        aria-hidden
        width={IMG}
        height={IMG}
        sizes={`${size}px`}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </span>
  );
}
