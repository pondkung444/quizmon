import AppThemeMarker from "@/components/AppThemeMarker";

// ธีมแอป (dusk/day) ครอบทุกหน้าใน /raid — ดู components/AppThemeMarker.tsx
// ฉากด่านเป็นภาพของตัวเอง ธีมเปลี่ยนแค่การ์ด/ปุ่ม/พื้นหลังรอบๆ
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppThemeMarker />
      {children}
    </>
  );
}
