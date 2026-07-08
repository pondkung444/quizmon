import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

export default async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav className="flex items-center justify-between border-b border-gold-dim pb-4">
      <div className="flex gap-4 text-sm font-medium text-text2">
        <Link href="/quiz" className="hover:text-amber">
          ตอบคำถาม
        </Link>
        <Link href="/pet" className="hover:text-amber">
          เลี้ยงสัตว์
        </Link>
        <Link href="/eggs" className="hover:text-amber">
          คลังไข่
        </Link>
        <Link href="/collection" className="hover:text-amber">
          สมุดสะสม
        </Link>
      </div>
      {user && (
        <form action={signOut}>
          <button type="submit" className="text-sm text-text3 hover:text-red">
            ออกจากระบบ
          </button>
        </form>
      )}
    </nav>
  );
}
