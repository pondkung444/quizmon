"use client";

import { usePathname } from "next/navigation";

// ฉาก "โลกของ Qmon" (ลานฟาร์ม) ล้อมกรอบแอปบนจอกว้าง (≥ lg) — ตกแต่งล้วน ไม่มีข้อมูล/ปุ่ม
// แสดงเฉพาะหน้าที่มี <AppThemeMarker /> (CSS .world-backdrop ใน globals.css) และไม่ render เลยบนหน้าที่ห้ามมีฉาก
// (จอครู/TV/โปรเจกเตอร์ + guardian + my-plan) — สีทั้งหมดมาจาก token --world-* ที่ธีม dusk/day สลับให้
// ภาพเป็น SVG สำรอง: เปลี่ยนเป็นภาพจริงได้โดยแทนเนื้อใน FarLayer / GroundLayer (เช่น <img>) ทีละชั้น
const NO_WORLD_PREFIXES = ["/boss-raid", "/classroom", "/my-plan", "/guardian", "/teacher"];

function CloudLayer() {
  return (
    <div className="world-clouds absolute inset-x-0 top-[8%] h-[22%]">
      <svg viewBox="0 0 1600 200" preserveAspectRatio="none" className="h-full w-[200%]">
        {[0, 800].map((dx) => (
          <g key={dx} style={{ fill: "var(--world-cloud)" }}>
            <ellipse cx={120 + dx} cy={70} rx={90} ry={22} />
            <ellipse cx={170 + dx} cy={55} rx={50} ry={20} />
            <ellipse cx={520 + dx} cy={130} rx={110} ry={20} />
            <ellipse cx={690 + dx} cy={45} rx={70} ry={16} />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ฉากไกล: เนินเขา + บ้านเล็ก (ซ้าย) + หลังคาโรงเรียน (ขวา)
function FarLayer() {
  return (
    <svg viewBox="0 0 1600 500" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[55%] w-full">
      <path d="M0 330 Q220 230 460 300 T900 290 T1350 270 T1600 300 V500 H0Z" style={{ fill: "var(--world-hill-far)" }} />
      <g style={{ fill: "var(--world-building)" }}>
        <rect x={190} y={255} width={70} height={50} />
        <path d="M180 258 L225 222 L270 258Z" style={{ fill: "var(--world-roof)" }} />
        <rect x={1270} y={225} width={150} height={70} />
        <path d="M1255 228 L1345 185 L1435 228Z" style={{ fill: "var(--world-roof)" }} />
        <rect x={1337} y={160} width={16} height={30} />
      </g>
      <path d="M0 390 Q300 320 650 370 T1250 360 T1600 380 V500 H0Z" style={{ fill: "var(--world-hill-near)" }} />
    </svg>
  );
}

// พื้นหน้า: ทุ่งหญ้า + รั้ว
function GroundLayer() {
  return (
    <svg viewBox="0 0 1600 200" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[20%] w-full">
      <path d="M0 60 Q400 20 800 50 T1600 40 V200 H0Z" style={{ fill: "var(--world-ground)" }} />
      <g style={{ stroke: "var(--world-fence)" }} strokeWidth={6} strokeLinecap="round">
        <line x1={40} y1={95} x2={420} y2={85} />
        {[60, 140, 220, 300, 380].map((x) => (
          <line key={x} x1={x} y1={70} x2={x} y2={125} />
        ))}
        <line x1={1180} y1={85} x2={1560} y2={95} />
        {[1200, 1280, 1360, 1440, 1520].map((x) => (
          <line key={x} x1={x} y1={70} x2={x} y2={125} />
        ))}
      </g>
    </svg>
  );
}

export default function WorldBackdrop() {
  // อ่าน pathname ฝั่ง client — root layout ไม่ re-render ตอนเปลี่ยนหน้าด้วย <Link> (x-pathname จะค้างค่าหน้าแรก)
  const pathname = usePathname() ?? "";
  if (NO_WORLD_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div data-world-backdrop aria-hidden className="world-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "var(--world-sky)" }} />
      <CloudLayer />
      <FarLayer />
      <GroundLayer />
      {/* จุดตกแต่ง — ว่างไว้ ใส่ของทีหลัง */}
      <div data-world-slot="left" className="absolute bottom-[18%] left-[6%]" />
      <div data-world-slot="right" className="absolute bottom-[18%] right-[6%]" />
      <div data-world-slot="sky" className="absolute right-[12%] top-[10%]" />
      {/* ด้านข้างซีดลง ไม่แย่งสายตา + กรอบกลางใช้พื้นเดิมของแอป */}
      <div className="absolute inset-0" style={{ background: "var(--world-haze)" }} />
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 shadow-[0_0_40px_rgba(0,0,0,0.25)]"
        style={{ width: "var(--app-frame-w)", background: "var(--background)", backgroundImage: "var(--pet-page-bg)", backgroundRepeat: "no-repeat", backgroundSize: "100% 100%" }}
      />
    </div>
  );
}
