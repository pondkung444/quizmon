import AppThemeMarker from "@/components/AppThemeMarker";

// ธีมแอป (dusk/day) ครอบทุกหน้าใน /adventure — ดู components/AppThemeMarker.tsx
// ฉากดันเจี้ยนเป็นภาพของตัวเอง ธีมเปลี่ยนแค่การ์ด/ปุ่ม/พื้นหลังรอบๆ
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppThemeMarker />
      {children}
    </>
  );
}
