import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getGuardianAccess, getGuardianStudents } from "@/lib/guardian";
import GuardianLoginButton from "./GuardianLoginButton";
import StudentPicker from "@/components/guardian/StudentPicker";

export const dynamic = "force-dynamic";

type UnlinkedStudentRow = { student_username: string; revoked_at: string };

// เด็กที่ถอดผู้ปกครองคนนี้แล้วและยังไม่ผูกกลับ — RPC error คืน [] เงียบๆ (ไม่แสดงกล่อง ไม่พังหน้า)
async function getUnlinkedStudents(): Promise<UnlinkedStudentRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("guardian_get_unlinked_students");
    if (error) return [];
    return (data ?? []) as UnlinkedStudentRow[];
  } catch {
    return [];
  }
}

export default async function GuardianPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const access = await getGuardianAccess();
  const [students, unlinked] =
    access.status === "ok"
      ? await Promise.all([getGuardianStudents(), getUnlinkedStudents()])
      : [[], []];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center gap-6 bg-bg p-6 text-text">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gold-hi">QuizMon สำหรับผู้ปกครอง</h1>
        <p className="mt-1 text-sm text-text3">ติดตามความคืบหน้าของลูกที่ QuizMon</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {access.status === "unauthenticated" && (
          <div className="flex flex-col gap-4">
            {error === "oauth_failed" && (
              <p className="text-sm text-red">เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่</p>
            )}
            <p className="text-sm text-text2">เข้าสู่ระบบด้วยบัญชี Google เพื่อเริ่มต้น</p>
            <GuardianLoginButton />
          </div>
        )}

        {access.status === "not_enabled" && (
          <p className="text-sm text-text2">
            ฟีเจอร์นี้ยังไม่เปิดให้ใช้งานสำหรับบัญชีนี้ กรุณาติดต่อทีมงาน QuizMon
          </p>
        )}

        {access.status === "no_guardian_row" && (
          <p className="text-sm text-text2">
            บัญชีนี้ยังไม่ได้ตั้งค่าเป็นบัญชีผู้ปกครอง กรุณาติดต่อทีมงาน QuizMon
          </p>
        )}

        {access.status === "ok" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text2">
              ยินดีต้อนรับ{access.displayName ? ` ${access.displayName}` : ""}
            </p>

            {unlinked.map((u) => (
              <div
                key={`${u.student_username}-${u.revoked_at}`}
                className="rounded-lg border border-border bg-bg p-4"
              >
                <p className="text-sm font-semibold text-text">
                  การเชื่อมต่อกับน้อง{u.student_username}สิ้นสุดแล้ว
                </p>
                <p className="mt-1 text-sm text-text2">
                  น้องเป็นคนจัดการการเชื่อมต่อนี้เองได้เสมอ ถ้าอยากดูข้อมูลอีกครั้ง ลองคุยกับน้องและขอรหัสใหม่ได้
                </p>
              </div>
            ))}

            {students.length > 0 && (
              <StudentPicker students={students} hrefFor={(id) => `/guardian/${id}`} />
            )}

            <Link
              href="/guardian/link"
              className="rounded-full py-2.5 text-center font-semibold text-track transition hover:opacity-90"
              style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
            >
              {students.length > 0 ? "เชื่อมบัญชีนักเรียนเพิ่ม" : "เชื่อมบัญชีนักเรียน"}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
