import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

import type { FactoryOperationalHealth } from "@/lib/questionFactory/operationalHealth";

const STATUS = {
  healthy: { label: "พร้อมทำงาน", icon: CheckCircle2, className: "border-emerald-700/60 bg-emerald-950/25 text-emerald-200" },
  attention: { label: "รอดำเนินการ", icon: Clock3, className: "border-amber-700/60 bg-amber-950/25 text-amber-200" },
  critical: { label: "ต้องตรวจสอบ", icon: AlertTriangle, className: "border-red/60 bg-red/10 text-red-200" },
} as const;

type FactoryControls = {
  lease: { state: string; owner: string; version: number; expiresAt: string } | null;
  budget: { version: number; generated: [number, number]; assets: [number, number]; retries: [number, number];
    costMicrounits: [number, number]; exhaustedReason: Record<string, unknown> | null } | null;
};

export default function FactoryOperationalHealthPanel({ health }: { health: FactoryOperationalHealth; controls: FactoryControls }) {
  const status = STATUS[health.severity];
  const StatusIcon = status.icon;
  const reviewedCount = health.bottleneck?.state === "approved" ? health.bottleneck.count : 0;
  const waitingCount = health.bottleneck?.state === "pending_human_review" ? health.bottleneck.count : 0;

  return (
    <section className="rounded-3xl border border-border bg-card p-5" aria-labelledby="factory-status-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">สถานะงานล่าสุด</p>
          <h2 id="factory-status-title" className="mt-1 text-lg font-bold text-text">ภาพรวมที่ต้องรู้</h2>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${status.className}`}>
          <StatusIcon size={16} aria-hidden="true" /> {status.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Summary label="รอตรวจ" value={`${waitingCount} ข้อ`} hint={waitingCount ? "เปิดคิวตรวจเพื่อดำเนินการ" : "ไม่มีข้อค้างตรวจ"} />
        <Summary label="อนุมัติแล้ว" value={`${reviewedCount} ข้อ`} hint={reviewedCount ? "กำลังเตรียมเปิดใช้งาน" : "ไม่มีข้อรอเปิดใช้งาน"} />
        <Summary
          label="สถานะ Run"
          value={health.completionReadiness === "completed" ? "เสร็จสมบูรณ์" : health.completionReadiness === "ready" ? "พร้อมปิดงาน" : "กำลังดำเนินการ"}
          hint={`${health.terminalSlotCount} จาก ${health.terminalSlotCount + health.nonterminalSlotCount} ข้อจบกระบวนการ`}
        />
      </div>

      {health.issues.length > 0 && (
        <details className="mt-4 rounded-2xl border border-amber-800/50 bg-amber-950/15 p-4 text-sm text-text2">
          <summary className="cursor-pointer font-semibold text-amber-200">รายละเอียดที่ควรตรวจสอบ ({health.issues.length})</summary>
          <ul className="mt-3 space-y-2">{health.issues.map((issue) => <li key={issue.code}>• {issue.message}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-track p-4">
      <p className="text-xs font-semibold text-text3">{label}</p>
      <p className="mt-1 text-xl font-bold text-text">{value}</p>
      <p className="mt-1 text-xs text-text2">{hint}</p>
    </div>
  );
}
