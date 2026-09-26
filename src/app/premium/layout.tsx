import AppThemeMarker from "@/components/AppThemeMarker";

// ธีมแอป (dusk/day) แบบเดียวกับ /pet และ /my-plan — ดู components/AppThemeMarker.tsx
export default function PremiumLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppThemeMarker />
      {children}
    </>
  );
}
