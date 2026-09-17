// ครอบรูป Qmon avatar เดิมด้วยกรอบโปรไฟล์ (frame_definitions.tier) ถ้ามี — ไม่มี tier ก็ render
// children เฉยๆ ไม่มีอะไรเปลี่ยน ปลอดภัยกับทุกจุดที่เรียกใช้แม้คนนั้นไม่มีกรอบเลย
// size คือขนาดกรอบรวม (px) — รูปข้างในจะเล็กกว่าเล็กน้อยเพื่อเผื่อที่ให้เส้นกรอบ (ดู .guardian-frame-avatar)
export default function PetAvatarFrame({
  tier,
  size,
  children,
}: {
  tier: string | null | undefined;
  size: number;
  children: React.ReactNode;
}) {
  if (!tier) return <>{children}</>;

  return (
    <span
      className={`guardian-frame guardian-frame-${tier}`}
      style={{ "--frame-size": `${size}px` } as React.CSSProperties}
    >
      <span className="guardian-frame-avatar">{children}</span>
    </span>
  );
}
