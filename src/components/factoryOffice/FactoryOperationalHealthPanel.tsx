import { AlertTriangle, CheckCircle2, Gauge, ShieldAlert } from "lucide-react";

import type { FactoryOperationalHealth } from "@/lib/questionFactory/operationalHealth";

const SEVERITY_STYLE = {
  healthy: { label: "ระบบปกติ", icon: CheckCircle2, className: "border-emerald-800/60 bg-emerald-950/25 text-emerald-200" },
  attention: { label: "ต้องติดตาม", icon: AlertTriangle, className: "border-amber-700/60 bg-amber-950/25 text-amber-200" },
  critical: { label: "ต้องดำเนินการ", icon: ShieldAlert, className: "border-red/60 bg-red/10 text-red-200" },
} as const;

function minutesLabel(minutes: number | null): string {
  if (minutes === null) return "ไม่มี event";
  if (minutes < 60) return `${minutes} นาที`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} ชั่วโมง`;
  return `${Math.floor(minutes / (24 * 60))} วัน`;
}

type FactoryControls = {
  lease: { state: string; owner: string; version: number; expiresAt: string } | null;
  budget: { version: number; generated: [number, number]; assets: [number, number]; retries: [number, number];
    costMicrounits: [number, number]; exhaustedReason: Record<string, unknown> | null } | null;
};

export default function FactoryOperationalHealthPanel({ health, controls }: { health: FactoryOperationalHealth; controls: FactoryControls }) {
  const style = SEVERITY_STYLE[health.severity];
  const StatusIcon = style.icon;
  return (
    <section className="rounded-3xl border border-border bg-card p-5" aria-labelledby="factory-health-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Phase 6.1 · Operational Health</p>
          <h2 id="factory-health-title" className="mt-1 text-lg font-bold text-text">สุขภาพการเดินงาน</h2>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${style.className}`}>
          <StatusIcon size={16} aria-hidden="true" /> {style.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Completion" value={{ completed: "ปิด Run แล้ว", ready: "พร้อมปิด Run", not_ready: "ยังไม่พร้อม", not_applicable: "ไม่อยู่ในขั้นปิด" }[health.completionReadiness]} />
        <Metric label="Terminal / Non-terminal" value={`${health.terminalSlotCount} / ${health.nonterminalSlotCount}`} />
        <Metric label="Stale / Blocked" value={`${health.staleSlotCount} / ${health.blockedSlotCount}`} />
        <Metric label="Latest event" value={minutesLabel(health.latestEventAgeMinutes)} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
        <div className="rounded-2xl border border-border bg-track p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-text"><Gauge size={17} aria-hidden="true" /> สัญญาณปฏิบัติการ</div>
          {health.issues.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-300">ไม่พบ counter drift, stale Slot, blocked Slot หรือ retry pressure</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-text2">
              {health.issues.map((issue) => <li key={issue.code}>• {issue.message}</li>)}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-track p-4 text-sm">
          <p className="font-bold text-text">Bottleneck</p>
          <p className="mt-2 text-text2">
            {health.bottleneck
              ? `${health.bottleneck.state} · ${health.bottleneck.count} ข้อ · เก่าสุด ${minutesLabel(health.bottleneck.oldestMinutes)}`
              : "ไม่มีงานค้างใน pipeline"}
          </p>
          <p className="mt-2 text-xs text-text3">Revision {health.revisionPressureCount} · Retry {health.retryPressureCount}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-track p-4 text-sm text-text2">
          <p className="font-bold text-text">Worker lease</p>
          <p className="mt-2">{controls.lease
            ? `${controls.lease.state} · ${controls.lease.owner} · v${controls.lease.version}`
            : "ไม่มี worker ถือครอง Run นี้"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-track p-4 text-sm text-text2">
          <p className="font-bold text-text">Run budget</p>
          {controls.budget ? <>
            <p className="mt-2">Generated {controls.budget.generated.join("/")} · Assets {controls.budget.assets.join("/")} · Retry {controls.budget.retries.join("/")}</p>
            <p className="mt-1">Cost {controls.budget.costMicrounits.join("/")} µunit · v{controls.budget.version}</p>
            {controls.budget.exhaustedReason && <p className="mt-2 text-amber-300">หยุดด้วยเหตุ: {String(controls.budget.exhaustedReason.reason_code ?? "budget exhausted")}</p>}
          </> : <p className="mt-2">Run เก่าที่ยังไม่ได้ตั้ง budget contract</p>}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-track px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text3">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text">{value}</p>
    </div>
  );
}
