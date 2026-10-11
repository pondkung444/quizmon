import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  farmSocialAvailable,
  visitPreference,
  farmStickerInbox,
} from "@/lib/farm/social-server";
import FarmEncouragementClient from "@/components/farm/FarmEncouragementClient";
export default async function EncouragementPage() {
  if (!(await getUser())) redirect("/login");
  if (!(await farmSocialAvailable()))
    return (
      <main className="p-4">
        <Link href="/collection">← ฟาร์ม</Link>
        <p>กำลังเตรียมระบบเยี่ยมฟาร์มและกำลังใจ</p>
      </main>
    );
  const [enabled, inbox] = await Promise.all([
    visitPreference(),
    farmStickerInbox(),
  ]);
  return <FarmEncouragementClient enabled={enabled} inbox={inbox} />;
}
