"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SchoolOption = { value: string; label: string };

// navigate ด้วย router.push แทน client state — หน้า /admin/analytics เป็น server component
// ที่ render ใหม่ทั้งหน้าตาม searchParams อยู่แล้ว ไม่ต้องมี state ฝั่งนี้ซ้ำซ้อน
export default function SchoolFilterSelect({ options }: { options: SchoolOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("school") ?? "";

  return (
    <label className="flex items-center gap-2 text-sm text-text2">
      <span className="text-text3">โรงเรียน</span>
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) params.set("school", e.target.value);
          else params.delete("school");
          const qs = params.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
        className="rounded-lg border border-gold-dim bg-card px-3 py-1.5 text-sm text-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
