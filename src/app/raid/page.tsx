import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  isRaidAllowlisted,
  getActiveRaidRun,
  getActiveRaidType,
  getEligibleRaidPets,
  getRaidTicketCount,
  getUserRaidGearItems,
} from "@/lib/raid";
import RaidClient from "@/components/raid/RaidClient";

// ระบบท้าทายยังไม่เปิดให้นักเรียนเห็น — ไม่มีปุ่มเข้าจากหน้าไหนเลย และเช็ค allowlist ฝั่ง server
// ตรงนี้ด้วย (ซ่อนปุ่มอย่างเดียวไม่พอ กลุ่ม stage 4 คือกลุ่มที่จะลองเดา URL มากที่สุด)
export default async function RaidPage({
  searchParams,
}: {
  searchParams: Promise<{ pet?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const { pet: petParam } = await searchParams;

  const supabase = await createClient();
  const allowed = await isRaidAllowlisted(supabase, user.id);
  if (!allowed) redirect("/pet");

  const activeView = await getActiveRaidRun(supabase, user.id);
  if (activeView) {
    return <RaidClient view={activeView} />;
  }

  const raidType = await getActiveRaidType(supabase);
  if (!raidType) redirect("/pet");

  const [pets, ticketCount, gearItems] = await Promise.all([
    getEligibleRaidPets(supabase, user.id),
    getRaidTicketCount(supabase, user.id),
    getUserRaidGearItems(supabase, user.id),
  ]);

  // ?pet= จาก /collection/[petId] — ใช้ได้ก็ต่อเมื่อยังอยู่ในลิสต์ pets ที่ท้าทายได้เท่านั้น (id ผิด/
  // ไม่มี/ไม่พร้อม ตกกลับไปจอเลือกปกติเงียบๆ ไม่ error)
  const preselectedPetId = petParam && pets.some((p) => p.id === petParam) ? petParam : null;

  return (
    <RaidClient
      view={{ phase: "predeparture", raidType, pets, ticketCount, preselectedPetId, gearItems }}
    />
  );
}
