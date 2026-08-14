import { createClient, getUser } from "@/lib/supabase/server";
import { getHallOfFamePage } from "@/lib/hallOfFame";
import SignOutLink from "@/components/SignOutLink";
import HallOfFameList from "@/components/HallOfFameList";

// เฟส 8: ตัด currentWeek ออก (ย้ายไปหมวด "การฝึกประจำสัปดาห์" ขอบเขต "ทั้งหมด" ในแท็บ "อันดับ"
// แทนตามที่ตกลงไว้ตั้งแต่เฟส 1) เหลือแค่ประวัติแชมป์ที่จบแล้ว — getCurrentWeekLeaders ใน
// src/lib/hallOfFame.ts ไม่ได้ลบตัวฟังก์ชัน เผื่อมีที่อื่นอ้างอิง แค่เลิกเรียกจากหน้านี้
export default async function HallOfFamePage() {
  const user = await getUser();

  let initialWeeks: Awaited<ReturnType<typeof getHallOfFamePage>>["weeks"] = [];
  let initialHasMore = false;

  if (user) {
    const supabase = await createClient();
    // ครั้งแรกที่โหลดหน้าโชว์แค่ 5 สัปดาห์ล่าสุด (ให้ความรู้สึก "เพิ่งเกิดขึ้น" ไม่ใช่ dump ข้อมูลทั้งหมด)
    // ปุ่ม "โหลดเพิ่ม" ใน HallOfFameList.tsx ยังใช้ batch ขนาด 10 ตามเดิม (ไม่แก้ default ของ
    // getHallOfFamePage/RPC เอง แก้แค่ตรง call site นี้จุดเดียว)
    const page = await getHallOfFamePage(supabase, 0, 5);
    initialWeeks = page.weeks;
    initialHasMore = page.hasMore;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SignOutLink />
      <div>
        <h1 className="text-2xl font-bold text-gold-hi">Hall of Fame</h1>
        <p className="text-sm text-text3">แชมป์อันดับ 1 กระดานผู้นำประจำสัปดาห์ — ม.ต้น และ ม.ปลาย</p>
      </div>

      {!user ? (
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดู Hall of Fame
        </div>
      ) : (
        <HallOfFameList currentUserId={user.id} initialWeeks={initialWeeks} initialHasMore={initialHasMore} />
      )}
    </main>
  );
}
