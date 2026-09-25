import Image from "next/image";
import type { RosterPet } from "@/lib/classroom/roster";

// รูป Qmon ในกรอบสี่เหลี่ยมจัตุรัส — ใช้ fill + object-contain (sprite ไม่ได้จัตุรัสทุกตัว ดูบั๊ก
// next/image width/height hint ผิดแล้ว sizing เพี้ยน) ไม่มี pet → ตัวอักษรแรกของชื่อแทน
export default function RosterAvatar({
  pet,
  name,
  size,
  dim = false,
}: {
  pet: RosterPet | null;
  name: string;
  size: number;
  dim?: boolean;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl bg-track ${dim ? "opacity-40 grayscale" : ""}`}
      style={{ width: size, height: size }}
    >
      {pet ? (
        <Image
          src={pet.imagePath}
          alt={pet.nickname ?? pet.speciesName}
          fill
          sizes={`${size}px`}
          className="object-contain p-1"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-bold text-gold-hi"
          style={{ fontSize: size * 0.4 }}
        >
          {name.trim().charAt(0) || "?"}
        </span>
      )}
    </div>
  );
}
