import AppThemeMarker from "@/components/AppThemeMarker";

// ธีมแอป (dusk/day) ครอบทุกหน้าใน /achievements — ดู components/AppThemeMarker.tsx
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppThemeMarker />
      {children}
    </>
  );
}
