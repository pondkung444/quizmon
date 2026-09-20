"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChartBar, Route, Target, ClipboardList, ChevronDown, LogOut, ArrowLeft } from "lucide-react";
import BottomSheet from "@/components/social/BottomSheet";
import { guardianSignOut } from "@/app/guardian/actions";
import { guardianBasePath, type ViewerMode } from "./viewerMode";

export type ShellStudent = { student_id: string; username: string; grade_level: string | null };

const SECTIONS = [
  { key: "overview", label: "ภาพรวม", Icon: ChartBar, path: "" },
  { key: "plan", label: "แผนฝึก", Icon: Route, path: "/plan" },
  { key: "goal", label: "เป้าหมาย", Icon: Target, path: "/goal" },
  { key: "report", label: "รายงาน", Icon: ClipboardList, path: "/report" },
] as const;

// เดา section ปัจจุบันจาก pathname เอง ไม่รับเป็น prop — กันเคส back/forward ของ browser ที่ prop
// จาก server component เดิมค้างไม่อัปเดตตาม (usePathname เป็น client-side ตามจริงเสมอ)
function currentSectionKey(pathname: string): (typeof SECTIONS)[number]["key"] {
  if (pathname.endsWith("/plan")) return "plan";
  if (pathname.endsWith("/goal")) return "goal";
  if (pathname.endsWith("/report")) return "report";
  return "overview";
}

// สลับนักเรียนแล้วคง section เดิมไว้ (อยู่หน้าแผนฝึกของคนนี้ สลับไปอีกคน ควรไปหน้าแผนฝึกของคนใหม่
// เลย ไม่ใช่เด้งกลับภาพรวมทุกครั้ง) — ต่อ path ปัจจุบันเข้ากับ studentId ใหม่ตรงๆ
function hrefForStudent(pathname: string, currentStudentId: string, nextStudentId: string): string {
  const suffix = pathname.slice(pathname.indexOf(currentStudentId) + currentStudentId.length);
  return `/guardian/${nextStudentId}${suffix}`;
}

export default function GuardianShell({
  studentId,
  studentUsername,
  students,
  displayName,
  viewerMode = "guardian",
  children,
}: {
  studentId: string;
  studentUsername: string;
  students: ShellStudent[];
  displayName: string | null;
  // "self" = นักเรียน self-serve ดูของตัวเอง (/my-plan/*): ไม่มีตัวสลับนักเรียน ไม่มีปุ่ม guardianSignOut
  // (ออกจากระบบผ่านแอปปกติ) แต่มีลิงก์กลับ /pet แทน — "guardian" (default) เหมือนเดิมทุกอย่าง
  viewerMode?: ViewerMode;
  children: React.ReactNode;
}) {
  const isSelf = viewerMode === "self";
  const basePath = guardianBasePath(viewerMode, studentId);
  const pathname = usePathname();
  const active = currentSectionKey(pathname);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const hasMultipleStudents = students.length > 1;

  return (
    <div className="flex min-h-screen flex-col gd-shell text-text lg:flex-row">
      {/* Sidebar — เฉพาะจอกว้าง (lg ขึ้นไป) คงที่ตลอด ไม่ต้องเลื่อนหา */}
      <aside className="hidden w-56 flex-none flex-col gap-6 border-r border-border p-5 lg:flex">
        {isSelf && <p className="text-sm font-bold text-text">แผนของฉัน</p>}
        {!isSelf && (
        <div>
          <p className="text-xs text-text3">กำลังดูของ</p>
          <button
            type="button"
            onClick={() => hasMultipleStudents && setSwitcherOpen(true)}
            disabled={!hasMultipleStudents}
            className="mt-1 flex w-full items-center justify-between rounded-lg bg-card px-3 py-2 text-left disabled:cursor-default"
          >
            <span className="truncate text-sm font-bold text-text">{studentUsername}</span>
            {hasMultipleStudents && <ChevronDown className="h-4 w-4 flex-none text-text3" />}
          </button>
        </div>
        )}

        <nav className="flex flex-col gap-1">
          {SECTIONS.map(({ key, label, Icon, path }) => (
            <Link
              key={key}
              href={`${basePath}${path}`}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active === key ? "bg-mint/15 font-bold text-mint" : "text-text2 hover:bg-card"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {isSelf && (
          <Link href="/pet" className="mt-auto flex items-center gap-2 text-xs text-text3 hover:text-gold-hi">
            <ArrowLeft className="h-3.5 w-3.5" />
            กลับหน้าหลัก
          </Link>
        )}
        {!isSelf && (
        <form action={guardianSignOut} className="mt-auto">
          <button type="submit" className="flex items-center gap-2 text-xs text-text3 hover:text-red">
            <LogOut className="h-3.5 w-3.5" />
            ออกจากระบบ
          </button>
        </form>
        )}
      </aside>

      {/* Header มือถือ/tablet — แสดงเฉพาะจอแคบกว่า lg */}
      <header className="flex items-center justify-between border-b border-border p-4 lg:hidden">
        {isSelf && (
          <>
            <p className="text-base font-bold text-text">แผนของฉัน</p>
            <Link href="/pet" aria-label="กลับหน้าหลัก" className="text-text3 hover:text-gold-hi">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </>
        )}
        {!isSelf && (
        <button
          type="button"
          onClick={() => hasMultipleStudents && setSwitcherOpen(true)}
          disabled={!hasMultipleStudents}
          className="flex items-center gap-1 disabled:cursor-default"
        >
          <div className="text-left">
            <p className="text-[11px] text-text3">กำลังดูของ</p>
            <p className="text-base font-bold text-text">{studentUsername}</p>
          </div>
          {hasMultipleStudents && <ChevronDown className="h-4 w-4 text-text3" />}
        </button>
        )}
        {!isSelf && (
        <form action={guardianSignOut}>
          <button type="submit" aria-label="ออกจากระบบ" className="text-text3 hover:text-red">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
        )}
      </header>

      <main className="min-w-0 flex-1 pb-20 lg:pb-0">
        {/* ความกว้างเนื้อหา: เดิมล็อกที่ max-w-4xl (896px) ทุกหน้า จอกว้างจึงเหลือที่ว่างสองข้างเยอะ —
            ภาพรวม/รายงานเป็นหน้า data-dense กริดหลายคอลัมน์ ให้กว้างสุด 1440px, แผนฝึกมี 2 กลุ่มวิชาข้างกัน
            1152px, เป้าหมายเป็นฟอร์มคอลัมน์เดียว คงแคบไว้ (breakpoint ของ nav ยังเป็น lg = 1024px เหมือนเดิม) */}
        <div
          className={`mx-auto w-full p-4 lg:p-8 ${
            active === "overview" || active === "report"
              ? "max-w-[420px] md:max-w-5xl lg:max-w-[1440px]"
              : active === "plan"
                ? "max-w-[420px] lg:max-w-6xl"
                : "max-w-[420px] lg:max-w-4xl"
          }`}
        >
          {children}
        </div>
      </main>

      {/* Bottom tab — เฉพาะจอแคบกว่า lg เอื้อมนิ้วโป้งง่าย เหมือน pattern แอปฝั่งเด็ก */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[#385b57] bg-[#1b1f25]/95 backdrop-blur lg:hidden">
        {SECTIONS.map(({ key, label, Icon, path }) => (
          <Link
            key={key}
            href={`${basePath}${path}`}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
              active === key ? "text-mint" : "text-text3"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>

      {switcherOpen && (
        <BottomSheet title="เลือกนักเรียน" onClose={() => setSwitcherOpen(false)}>
          <div className="flex flex-col gap-2">
            {displayName && <p className="mb-1 text-xs text-text3">บัญชี {displayName}</p>}
            {students.map((s) => (
              <Link
                key={s.student_id}
                href={hrefForStudent(pathname, studentId, s.student_id)}
                onClick={() => setSwitcherOpen(false)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                  s.student_id === studentId
                    ? "border-gold-hi bg-gold-hi/10"
                    : "border-border bg-track hover:border-gold-dim"
                }`}
              >
                <span className="font-medium text-text">{s.username}</span>
                {s.grade_level && <span className="text-xs text-text3">{s.grade_level}</span>}
              </Link>
            ))}
            <Link
              href="/guardian/link"
              onClick={() => setSwitcherOpen(false)}
              className="mt-1 rounded-xl border border-dashed border-gold-dim px-4 py-3 text-center text-sm font-semibold text-text2"
            >
              + เชื่อมบัญชีนักเรียนเพิ่ม
            </Link>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
