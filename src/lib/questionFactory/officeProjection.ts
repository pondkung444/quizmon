export const FACTORY_OFFICE_ROLES = [
  "factory-manager",
  "question-author",
  "question-qc",
  "image-builder",
  "image-qc",
  "publisher",
] as const;

export type FactoryOfficeRole = (typeof FACTORY_OFFICE_ROLES)[number];

export const FACTORY_OFFICE_ACTIONS = {
  "factory-manager": ["idle", "receive_work", "working", "send_work", "monitoring", "error", "success"],
  "question-author": ["idle", "receive_work", "working", "thinking", "error", "revision", "send_work", "success"],
  "question-qc": ["idle", "receive_work", "working", "thinking", "compare", "success", "revision", "error"],
  "image-builder": ["idle", "receive_work", "working", "thinking", "asset_ready", "revision", "send_work", "success"],
  "image-qc": ["idle", "receive_work", "compare", "working", "mobile_preview", "success", "revision", "error"],
  publisher: ["idle", "receive_work", "final_check", "working", "send_work", "success", "waiting", "error"],
} as const satisfies Record<FactoryOfficeRole, readonly string[]>;

export type FactoryOfficeAction<R extends FactoryOfficeRole = FactoryOfficeRole> =
  (typeof FACTORY_OFFICE_ACTIONS)[R][number];

export type QuestionFactoryRunStatus =
  | "created" | "running" | "paused" | "waiting_human_review"
  | "completed" | "cancelled" | "failed";

export type QuestionFactorySlotState =
  | "planned" | "authoring" | "question_qc" | "author_revision"
  | "asset_build" | "asset_qc" | "pending_human_review" | "approved"
  | "active" | "rejected" | "blocked" | "cancelled";

export type FactoryOfficeInput = {
  runStatus: QuestionFactoryRunStatus;
  slotState?: QuestionFactorySlotState | null;
  latestEventType?: string | null;
};

export type FactoryOfficeProjection = {
  role: FactoryOfficeRole;
  action: FactoryOfficeAction;
  isActive: boolean;
};

const EVENT_ACTIONS: Partial<Record<string, Partial<Record<FactoryOfficeRole, FactoryOfficeAction>>>> = {
  SLOT_ASSIGNED: { "factory-manager": "send_work", "question-author": "receive_work" },
  AUTHOR_STARTED: { "question-author": "working", "factory-manager": "monitoring" },
  AUTHOR_COMPLETE: { "question-author": "send_work", "question-qc": "receive_work" },
  QUESTION_QC_PASS: { "question-qc": "success", "image-builder": "receive_work" },
  QUESTION_QC_REVISE: { "question-qc": "revision", "question-author": "receive_work" },
  QUESTION_QC_REJECT: { "question-qc": "error", "factory-manager": "error" },
  QUESTION_REVISION_STARTED: { "question-author": "revision" },
  QUESTION_REVISED: { "question-author": "send_work", "question-qc": "receive_work" },
  ASSET_BUILD_STARTED: { "image-builder": "working" },
  ASSET_CREATED: { "image-builder": "asset_ready", "image-qc": "receive_work" },
  ASSET_QC_PASS: { "image-qc": "success", publisher: "receive_work" },
  ASSET_QC_REGENERATE: { "image-qc": "revision", "image-builder": "revision" },
  ASSET_QC_REJECT: { "image-qc": "error", "factory-manager": "error" },
  ITEM_READY_FOR_REVIEW: { publisher: "final_check", "factory-manager": "monitoring" },
  HUMAN_APPROVED: { publisher: "receive_work", "factory-manager": "success" },
  HUMAN_REVISION_REQUESTED: { publisher: "waiting", "question-author": "revision" },
  HUMAN_REJECTED: { publisher: "error", "factory-manager": "error" },
  QUESTION_ACTIVATED: { publisher: "success", "factory-manager": "success" },
  RUN_COMPLETED: { "factory-manager": "success", publisher: "success" },
  RUN_FAILED: { "factory-manager": "error" },
};

const STATE_ACTIONS: Record<QuestionFactorySlotState, Partial<Record<FactoryOfficeRole, FactoryOfficeAction>>> = {
  planned: { "factory-manager": "working" },
  authoring: { "factory-manager": "monitoring", "question-author": "working" },
  question_qc: { "factory-manager": "monitoring", "question-qc": "working" },
  author_revision: { "factory-manager": "monitoring", "question-author": "revision", "question-qc": "revision" },
  asset_build: { "factory-manager": "monitoring", "image-builder": "working" },
  asset_qc: { "factory-manager": "monitoring", "image-qc": "compare" },
  pending_human_review: { "factory-manager": "monitoring", publisher: "waiting" },
  approved: { "factory-manager": "monitoring", publisher: "final_check" },
  active: { "factory-manager": "success", publisher: "success" },
  rejected: { "factory-manager": "error", publisher: "error" },
  blocked: { "factory-manager": "error" },
  cancelled: {},
};

function safeAction(role: FactoryOfficeRole, candidate?: FactoryOfficeAction): FactoryOfficeAction {
  return candidate && (FACTORY_OFFICE_ACTIONS[role] as readonly string[]).includes(candidate)
    ? candidate
    : "idle";
}

export function projectFactoryOffice(input: FactoryOfficeInput): FactoryOfficeProjection[] {
  const eventActions = input.latestEventType ? EVENT_ACTIONS[input.latestEventType] : undefined;
  const stateActions = input.slotState ? STATE_ACTIONS[input.slotState] : undefined;

  return FACTORY_OFFICE_ROLES.map((role) => {
    let candidate = eventActions?.[role] ?? stateActions?.[role];

    // Run-level terminal states always win over stale slot/event data.
    if (input.runStatus === "failed") candidate = role === "factory-manager" ? "error" : "idle";
    if (input.runStatus === "completed") candidate = role === "factory-manager" || role === "publisher" ? "success" : "idle";
    if (input.runStatus === "cancelled") candidate = "idle";
    if (input.runStatus === "paused" && role === "factory-manager") candidate = "monitoring";
    if (input.runStatus === "waiting_human_review" && role === "publisher") candidate = "waiting";

    const action = safeAction(role, candidate);
    return { role, action, isActive: action !== "idle" };
  });
}

export function factoryOfficeSpritePath(role: FactoryOfficeRole, action: FactoryOfficeAction): string {
  return `/factory-office/v1/characters/${role}/${safeAction(role, action)}.webp`;
}
