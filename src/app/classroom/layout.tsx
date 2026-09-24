import AppThemeMarker from "@/components/AppThemeMarker";

// ธีมแอป (dusk/day) ครอบทุกหน้าใน /classroom — ดู components/AppThemeMarker.tsx
// ฝั่งนักเรียนเท่านั้น (จอครู /teacher และจอทีวี /boss-raid/[id]/tv คงโทนเดิม)
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppThemeMarker />
      {children}
    </>
  );
}
