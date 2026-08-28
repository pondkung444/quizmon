"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { recordFactoryHumanReview, type FactoryHumanReviewDecision } from "@/lib/questionFactory/humanReviewServer";
import { loadFactoryReviewQueue } from "@/lib/questionFactory/reviewQueueServer";
import { getUser } from "@/lib/supabase/server";

export type HumanReviewActionState = { status: "idle" | "success" | "error"; message: string };

function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "").split(",")
    .map((value) => value.trim().toLowerCase()).filter(Boolean)
    .includes(email.toLowerCase());
}

export async function submitHumanReview(
  _previous: HumanReviewActionState,
  formData: FormData
): Promise<HumanReviewActionState> {
  try {
    const user = await getUser();
    if (!user?.email || !isAdminEmail(user.email)) return { status: "error", message: "ไม่มีสิทธิ์ตรวจข้อสอบ" };

    const slotId = Number(formData.get("slotId"));
    const decision = String(formData.get("decision") ?? "") as FactoryHumanReviewDecision;
    const feedback = String(formData.get("feedback") ?? "").trim();
    const requestedTarget = String(formData.get("revisionTarget") ?? "");
    if (!Number.isSafeInteger(slotId) || slotId < 1) return { status: "error", message: "Slot ไม่ถูกต้อง" };
    if (!(["APPROVE", "REQUEST_REVISION", "REJECT"] as string[]).includes(decision)) {
      return { status: "error", message: "คำตัดสินไม่ถูกต้อง" };
    }
    const revisionTarget = decision === "REQUEST_REVISION" && (requestedTarget === "text" || requestedTarget === "asset")
      ? requestedTarget : null;
    if (decision === "REQUEST_REVISION" && revisionTarget === null) {
      return { status: "error", message: "กรุณาเลือกว่าจะส่งกลับแก้ข้อความหรือภาพ" };
    }
    if (decision !== "APPROVE" && !feedback) {
      return { status: "error", message: "กรุณาระบุเหตุผลก่อนส่งกลับหรือปฏิเสธ" };
    }

    const item = (await loadFactoryReviewQueue()).find((candidate) => candidate.slotId === slotId);
    if (!item) return { status: "error", message: "ข้อนี้ไม่อยู่ในคิวแล้ว กรุณาโหลดหน้าใหม่" };
    if (!item.mappingCandidate) {
      return { status: "error", message: item.mappingError ?? "ข้อนี้ยังไม่มี Product Mapping Candidate" };
    }
    if (revisionTarget === "asset" && !item.asset) {
      return { status: "error", message: "ข้อนี้ไม่มีภาพให้ส่งกลับแก้" };
    }

    const issues = decision === "APPROVE" ? [] : [{ code: "human_feedback", message: feedback }];
    const operationHash = createHash("sha256").update(JSON.stringify({
      slotId, stateVersion: item.stateVersion, checksum: item.mappingCandidate.checksum,
      decision, revisionTarget, issues, reviewer: user.email.toLowerCase(),
    })).digest("hex");
    const result = await recordFactoryHumanReview({
      runKey: item.runKey, slotKey: item.slotKey, expectedStateVersion: item.stateVersion,
      subjectRevision: item.mappingCandidate.questionRevision,
      mappingCandidateChecksum: item.mappingCandidate.checksum,
      assetRevision: item.asset?.revision ?? null, assetChecksum: item.asset?.checksum ?? null,
      decision, revisionTarget, issues,
      evidence: { product_mapping_candidate: item.mappingCandidate },
      reviewerId: user.email.toLowerCase(), idempotencyKey: `human-review:${operationHash}`,
    });
    revalidatePath("/admin/question-factory/review");
    return { status: "success", message: result.replayed ? "ยืนยันคำตัดสินเดิมแล้ว" : "บันทึกคำตัดสินแล้ว" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "บันทึก Human Review ไม่สำเร็จ" };
  }
}
