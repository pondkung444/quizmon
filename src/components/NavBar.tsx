import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

export default async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
      <div className="flex gap-4 text-sm font-medium">
        <Link href="/quiz" className="hover:text-indigo-600">
          ตอบคำถาม
        </Link>
        <Link href="/pet" className="hover:text-indigo-600">
          เลี้ยงสัตว์
        </Link>
        <Link href="/eggs" className="hover:text-indigo-600">
          คลังไข่
        </Link>
        <Link href="/collection" className="hover:text-indigo-600">
          สมุดสะสม
        </Link>
      </div>
      {user && (
        <form action={signOut}>
          <button type="submit" className="text-sm text-gray-500 hover:text-red-600">
            ออกจากระบบ
          </button>
        </form>
      )}
    </nav>
  );
}
