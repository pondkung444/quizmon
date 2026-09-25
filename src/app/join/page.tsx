import { redirect } from "next/navigation";

// ลิงก์สั้นที่ครูเขียนบนกระดาน/ฉายบนจอ (quizmon.xyz/join) → หน้าเข้าห้องเรียนจริง
export default async function JoinShortcut({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  redirect(code ? `/classroom/join?code=${encodeURIComponent(code)}` : "/classroom/join");
}
