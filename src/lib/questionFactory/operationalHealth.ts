import type { QuestionFactoryRunStatus, QuestionFactorySlotState } from "./officeProjection.ts";

export type FactoryHealthSeverity = "healthy" | "attention" | "critical";
export type FactoryCompletionReadiness = "completed" | "ready" | "not_ready" | "not_applicable";

export type FactoryHealthIssue = {
  code: string;
  severity: Exclude<FactoryHealthSeverity, "healthy">;
  message: string;
};

export type FactoryOperationalHealth = {
  severity: FactoryHealthSeverity;
  completionReadiness: FactoryCompletionReadiness;
  issues: FactoryHealthIssue[];
  staleSlotCount: number;
  blockedSlotCount: number;
  revisionPressureCount: number;
  retryPressureCount: number;
  terminalSlotCount: number;
  nonterminalSlotCount: number;
  counterDrift: boolean;
  bottleneck: { state: QuestionFactorySlotState; count: number; oldestMinutes: number } | null;
  latestEventAgeMinutes: number | null;
};

export type FactoryOperationalRunInput = {
  status: QuestionFactoryRunStatus;
  targetActive: number;
  activeCount: number;
  pipelineReadyCount: number;
  lastError: Record<string, unknown> | null;
};

export type FactoryOperationalSlotInput = {
  state: QuestionFactorySlotState;
  authorRevision: number;
  technicalRetryCount: number;
  updatedAt: string;
};

const TERMINAL_STATES = new Set<QuestionFactorySlotState>(["active", "rejected", "cancelled"]);

const STALE_MINUTES: Partial<Record<QuestionFactorySlotState, number>> = {
  planned: 60,
  authoring: 30,
  question_qc: 30,
  author_revision: 240,
  asset_build: 60,
  asset_qc: 60,
  pending_human_review: 24 * 60,
  approved: 120,
  blocked: 0,
};

function ageMinutes(iso: string, nowMs: number): number {
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((nowMs - timestamp) / 60_000)) : 0;
}

export function evaluateFactoryOperationalHealth(input: {
  run: FactoryOperationalRunInput;
  slots: FactoryOperationalSlotInput[];
  latestEventAt: string | null;
  nowMs: number;
}): FactoryOperationalHealth {
  const { run, slots, nowMs } = input;
  const issues: FactoryHealthIssue[] = [];
  const stateCounts = new Map<QuestionFactorySlotState, number>();
  const oldestByState = new Map<QuestionFactorySlotState, number>();
  let activeSlots = 0;
  let approvedSlots = 0;
  let terminalSlotCount = 0;
  let staleSlotCount = 0;
  let blockedSlotCount = 0;
  let revisionPressureCount = 0;
  let retryPressureCount = 0;

  for (const slot of slots) {
    const age = ageMinutes(slot.updatedAt, nowMs);
    stateCounts.set(slot.state, (stateCounts.get(slot.state) ?? 0) + 1);
    oldestByState.set(slot.state, Math.max(oldestByState.get(slot.state) ?? 0, age));
    if (slot.state === "active") activeSlots++;
    if (slot.state === "approved") approvedSlots++;
    if (TERMINAL_STATES.has(slot.state)) terminalSlotCount++;
    if (slot.state === "blocked") blockedSlotCount++;
    if (slot.authorRevision > 0) revisionPressureCount++;
    if (slot.technicalRetryCount > 0) retryPressureCount++;
    const threshold = STALE_MINUTES[slot.state];
    if (threshold !== undefined && age > threshold) staleSlotCount++;
  }

  const nonterminalSlotCount = slots.length - terminalSlotCount;
  const counterDrift = run.activeCount !== activeSlots || run.pipelineReadyCount !== approvedSlots;
  if (counterDrift) {
    issues.push({
      code: "counter_drift",
      severity: "critical",
      message: `Run counters ไม่ตรง Slot facts (active ${run.activeCount}/${activeSlots}, ready ${run.pipelineReadyCount}/${approvedSlots})`,
    });
  }
  if (run.status === "failed" || run.lastError) {
    issues.push({ code: "run_error", severity: "critical", message: "Run มีสถานะล้มเหลวหรือบันทึก last_error" });
  }
  if (blockedSlotCount > 0) {
    issues.push({ code: "blocked_slots", severity: "critical", message: `มี Slot blocked ${blockedSlotCount} ข้อ` });
  }
  if (["created", "running", "paused", "waiting_human_review"].includes(run.status) && slots.length === 0) {
    issues.push({ code: "open_run_without_slots", severity: "critical", message: "Run เปิดอยู่แต่ไม่มี Slot" });
  }
  if (staleSlotCount > 0) {
    issues.push({ code: "stale_slots", severity: "attention", message: `มี Slot เกินเวลาคาดหมาย ${staleSlotCount} ข้อ` });
  }
  if (revisionPressureCount > 0 || retryPressureCount > 0) {
    issues.push({
      code: "retry_revision_pressure",
      severity: "attention",
      message: `Revision pressure ${revisionPressureCount} ข้อ · technical retry ${retryPressureCount} ข้อ`,
    });
  }

  let completionReadiness: FactoryCompletionReadiness = "not_applicable";
  if (run.status === "completed") completionReadiness = "completed";
  else if (run.status === "running") {
    completionReadiness = !counterDrift && nonterminalSlotCount === 0 && activeSlots === run.targetActive
      ? "ready"
      : "not_ready";
  }

  const bottleneckEntry = [...stateCounts.entries()]
    .filter(([state]) => !TERMINAL_STATES.has(state))
    .sort((left, right) => right[1] - left[1] || (oldestByState.get(right[0]) ?? 0) - (oldestByState.get(left[0]) ?? 0))[0];
  const bottleneck = bottleneckEntry ? {
    state: bottleneckEntry[0],
    count: bottleneckEntry[1],
    oldestMinutes: oldestByState.get(bottleneckEntry[0]) ?? 0,
  } : null;

  const latestEventAgeMinutes = input.latestEventAt ? ageMinutes(input.latestEventAt, nowMs) : null;
  const severity: FactoryHealthSeverity = issues.some((issue) => issue.severity === "critical")
    ? "critical"
    : issues.length > 0 ? "attention" : "healthy";

  return {
    severity,
    completionReadiness,
    issues,
    staleSlotCount,
    blockedSlotCount,
    revisionPressureCount,
    retryPressureCount,
    terminalSlotCount,
    nonterminalSlotCount,
    counterDrift,
    bottleneck,
    latestEventAgeMinutes,
  };
}
