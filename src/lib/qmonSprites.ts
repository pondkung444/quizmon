import manifestJson from "@/data/qmonSpriteManifest.json";
import type { SpriteClip, SpriteGeometry } from "@/lib/qmonAnimation";

// staticFit: ความสัมพันธ์ระหว่างรูปนิ่ง (public/pets/{key}.png) กับช่อง sprite ของตัวเดียวกัน
// ถ้าวาดรูปนิ่งเต็มกรอบสี่เหลี่ยมจัตุรัส W x W (มุมซ้ายบนที่ 0,0) ช่อง sprite ต้องวาดเป็นสี่เหลี่ยมจัตุรัส
// ด้านยาว `scale * W` โดยมุมซ้ายบนอยู่ที่ (`dx * W`, `dy * W`) — ตัวละครจะทับรูปนิ่งพอดี
// (dx/dy ติดลบได้ = ช่อง sprite ล้นออกซ้าย/บนของกรอบรูปนิ่ง) ค่ามาจาก scripts/sprite (static_fit)
export type StaticFit = { scale: number; dx: number; dy: number };

export type SpriteSet = {
  key: string;
  geometry: SpriteGeometry;
  idle: SpriteClip;
  happy: SpriteClip;
  staticFit: StaticFit;
};

type ManifestEntry = { idle: SpriteClip; happy: SpriteClip; staticFit?: StaticFit };
type Manifest = SpriteGeometry & { version: number; sprites: Record<string, ManifestEntry> };
const manifest = manifestJson as Manifest;
const geometry: SpriteGeometry = {
  cell: manifest.cell,
  gutter: manifest.gutter,
  columns: manifest.columns,
  rows: manifest.rows,
};

// "/pets/egg1_stage2_baby.png" -> "egg1_stage2_baby" (ชื่อไฟล์ตรงกับ key ของ sprite; stage 1/4 ไม่มีใน manifest)
export function spriteKeyFromStaticPath(path: string | null): string | null {
  const m = path ? /\/([^/]+)\.png$/.exec(path) : null;
  return m ? m[1] : null;
}

// ไม่มีใน manifest -> null -> ผู้เรียกใช้รูปนิ่งต่อ
export function getSpriteSet(staticImagePath: string | null): SpriteSet | null {
  const key = spriteKeyFromStaticPath(staticImagePath);
  const entry = key ? manifest.sprites[key] : undefined;
  if (!key || !entry || !entry.staticFit) return null;
  return { key, geometry, idle: entry.idle, happy: entry.happy, staticFit: entry.staticFit };
}
