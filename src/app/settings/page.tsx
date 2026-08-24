import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";
import NotificationSettings from "@/components/settings/NotificationSettings";
import FeedbackRow from "@/components/settings/FeedbackRow";
import packageJson from "../../../package.json";

export default async function SettingsPage() {
  const user = await getUser();
  const supabase = await createClient();

  // push_preferences ควรมีเสมอ (backfill + trigger handle_new_user ครอบคลุมแล้ว)
  // แต่กัน edge case ไว้ด้วยค่า default ปลอดภัยถ้าหาไม่เจอจริงๆ
  const { data: prefs } = await supabase
    .from("push_preferences")
    .select("push_enabled, daily_quest_enabled, daily_exp_enabled, adventure_enabled, social_enabled")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const { data: activePet } = await supabase
    .from("pets")
    .select("id")
    .eq("user_id", user?.id ?? "")
    .eq("is_active", true)
    .maybeSingle();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/pet" aria-label="กลับ" className="flex h-8 w-8 items-center justify-center text-text2">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-gold-hi">ตั้งค่า</h1>
      </div>

      <NotificationSettings
        initial={{
          push_enabled: prefs?.push_enabled ?? true,
          daily_quest_enabled: prefs?.daily_quest_enabled ?? true,
          daily_exp_enabled: prefs?.daily_exp_enabled ?? true,
          adventure_enabled: prefs?.adventure_enabled ?? true,
          social_enabled: prefs?.social_enabled ?? true,
        }}
      />

      <section className="rounded-2xl border border-gold-dim bg-card p-4">
        <h2 className="mb-1 text-sm font-bold text-gold-hi">บัญชี</h2>
        <Link
          href="/login/reset-password"
          className="flex w-full items-center justify-between py-3 text-sm text-text active:opacity-70"
        >
          เปลี่ยนรหัสผ่าน
          <ChevronRight className="h-4 w-4 text-text3" />
        </Link>
        <div className="my-1 border-t border-border" />
        <form action={signOut}>
          <button type="submit" className="w-full py-3 text-left text-sm font-medium text-red active:opacity-70">
            ออกจากระบบ
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-gold-dim bg-card p-4">
        <h2 className="mb-1 text-sm font-bold text-gold-hi">อื่นๆ</h2>
        <FeedbackRow petId={activePet?.id ?? null} />
        <div className="my-1 border-t border-border" />
        <Link
          href="/privacy"
          className="flex w-full items-center justify-between py-3 text-sm text-text active:opacity-70"
        >
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-text3" />
            นโยบายความเป็นส่วนตัว
          </span>
          <ChevronRight className="h-4 w-4 text-text3" />
        </Link>
      </section>

      <p className="mt-2 text-center text-xs text-text3">เวอร์ชัน {packageJson.version}</p>
    </main>
  );
}
