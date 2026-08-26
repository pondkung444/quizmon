import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import DeleteAccountForm from "./DeleteAccountForm";

export default async function DeleteAccountPage() {
  const user = await getUser();
  if (!user?.email) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/settings" aria-label="กลับ" className="flex h-8 w-8 items-center justify-center text-text2">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-gold-hi">ลบบัญชี</h1>
      </div>

      <DeleteAccountForm userEmail={user.email} />
    </main>
  );
}
