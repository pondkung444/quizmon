import { cookies } from "next/headers";
import { APP_THEME_COOKIE, parseAppTheme } from "@/lib/appTheme";

// ป้ายบอกธีมที่มองไม่เห็น — globals.css ใช้ :root:has([data-app-theme]) สลับ token สีทั้งเอกสาร
// (พื้นหลัง body + เมนูล่าง + modal ที่ fixed อยู่) เฉพาะตอนที่ป้ายนี้อยู่ในหน้า ออกจากหน้าเมื่อไหร่
// ป้ายหายไปพร้อมหน้า ทุกอย่างกลับเป็นโทนเดิมเอง (root layout ไม่ re-render ตอน client nav จึงวางที่นั่นไม่ได้)
// ใส่ใน layout.tsx ของ segment ที่ต้องการ หรือใน page ตรงๆ ถ้าบาง route ย่อยต้องคงโทนเดิม (เช่นจอต่อสู้ประลอง)
export default async function AppThemeMarker() {
  const theme = parseAppTheme((await cookies()).get(APP_THEME_COOKIE)?.value);
  return <span data-app-theme={theme} hidden />;
}
