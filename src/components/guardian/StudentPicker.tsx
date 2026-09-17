import Link from "next/link";
import type { GuardianStudent } from "@/lib/guardian";

// รายชื่อนักเรียนที่ลิงก์กับผู้ปกครองคนนี้ — ใช้ที่หน้า /guardian (landing) แสดงเป็นลิสต์ให้กด
// เข้า dashboard ของลูกแต่ละคน และใน GuardianShell (student switcher) ตอนมี 2+ คน
export default function StudentPicker({
  students,
  hrefFor,
  heading,
}: {
  students: GuardianStudent[];
  hrefFor: (studentId: string) => string;
  heading?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {heading && <p className="text-sm text-text2">{heading}</p>}
      <ul className="flex flex-col gap-2">
        {students.map((s) => (
          <li key={s.student_id}>
            <Link
              href={hrefFor(s.student_id)}
              className="flex items-center justify-between rounded-xl border border-border bg-track px-4 py-3 transition hover:border-gold"
            >
              <span className="font-medium text-text">{s.username}</span>
              {s.grade_level && <span className="text-xs text-text3">{s.grade_level}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
