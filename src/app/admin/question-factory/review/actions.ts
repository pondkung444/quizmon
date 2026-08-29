"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { recordFactoryHumanReview, type FactoryHumanReviewDecision } from "@/lib/questionFactory/humanReviewServer";
import { publishFactoryDraft } from "@/lib/questionFactory/draftPublishServer";
import { promoteFactoryAsset } from "@/lib/questionFactory/assetPromotionServer";
import { activateFactoryDraft } from "@/lib/questionFactory/activationServer";
import { loadFactoryReviewQueue } from "@/lib/questionFactory/reviewQueueServer";
import { getUser } from "@/lib/supabase/server";

export type HumanReviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
  processedSlotIds?: number[];
};

function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "").split(",")
    .map((value) => value.trim().toLowerCase()).filter(Boolean)
    .includes(email.toLowerCase());
}

async function approveQueueItem(
  item: Awaited<ReturnType<typeof loadFactoryReviewQueue>>[number],
  reviewerId: string,
) {
  if (item.state !== "pending_human_review") throw new Error(`${item.slotKey} ไม่ได้อยู่ในคิว Human Review`);
  if (!item.mappingCandidate) throw new Error(item.mappingError ?? `${item.slotKey} ยังไม่มี Product Mapping Candidate`);

  const operationHash = createHash("sha256").update(JSON.stringify({
    slotId: item.slotId, stateVersion: item.stateVersion, checksum: item.mappingCandidate.checksum,
    decision: "APPROVE", revisionTarget: null, issues: [], reviewer: reviewerId,
  })).digest("hex");
  return recordFactoryHumanReview({
    runKey: item.runKey, slotKey: item.slotKey, expectedStateVersion: item.stateVersion,
    subjectRevision: item.mappingCandidate.questionRevision,
    mappingCandidateChecksum: item.mappingCandidate.checksum,
    assetRevision: item.asset?.revision ?? null, assetChecksum: item.asset?.checksum ?? null,
    decision: "APPROVE", revisionTarget: null, issues: [],
    evidence: { product_mapping_candidate: item.mappingCandidate },
    reviewerId, idempotencyKey: `human-review:${operationHash}`,
  });
}

export async function submitBulkHumanApproval(
  _previous: HumanReviewActionState,
  formData: FormData,
): Promise<HumanReviewActionState> {
  try {
    const user = await getUser();
    if (!user?.email || !isAdminEmail(user.email)) return { status: "error", message: "ไม่มีสิทธิ์ตรวจข้อสอบ" };

    const slotIds = [...new Set(formData.getAll("slotIds").map(Number))];
    if (slotIds.length === 0 || slotIds.length > 100 || slotIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      return { status: "error", message: "กรุณาเลือก Slot ที่ถูกต้องอย่างน้อย 1 ข้อ" };
    }

    const queue = await loadFactoryReviewQueue();
    const itemsById = new Map(queue.map((item) => [item.slotId, item]));
    const missingIds = slotIds.filter((id) => !itemsById.has(id));
    if (missingIds.length > 0) {
      return { status: "error", message: "บางข้อไม่อยู่ในคิวแล้ว กรุณาโหลดหน้าใหม่ก่อนอนุมัติ" };
    }

    const reviewerId = user.email.toLowerCase();
    const results = await Promise.allSettled(slotIds.map((id) => approveQueueItem(itemsById.get(id)!, reviewerId)));
    const failures = results.flatMap((result, index) => result.status === "rejected"
      ? [`#${itemsById.get(slotIds[index])?.ordinal ?? slotIds[index]}: ${result.reason instanceof Error ? result.reason.message : "อนุมัติไม่สำเร็จ"}`]
      : []);
    const processedSlotIds = results.flatMap((result, index) => result.status === "fulfilled" ? [slotIds[index]] : []);
    const approvedCount = processedSlotIds.length;
    revalidatePath("/admin/question-factory/review");
    if (failures.length > 0) {
      return {
        status: "error",
        message: `อนุมัติสำเร็จ ${approvedCount}/${results.length} ข้อ · ${failures.join(" · ")}`,
        processedSlotIds,
      };
    }
    return { status: "success", message: `อนุมัติพร้อมกันสำเร็จ ${approvedCount} ข้อ`, processedSlotIds };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "อนุมัติหลายข้อไม่สำเร็จ" };
  }
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
    return {
      status: "success",
      message: result.replayed ? "ยืนยันคำตัดสินเดิมแล้ว" : "บันทึกคำตัดสินแล้ว",
      processedSlotIds: [slotId],
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "บันทึก Human Review ไม่สำเร็จ" };
  }
}

export async function submitDraftPublication(
  _previous: HumanReviewActionState,
  formData: FormData
): Promise<HumanReviewActionState> {
  try {
    const user = await getUser();
    if (!user?.email || !isAdminEmail(user.email)) return { status: "error", message: "ไม่มีสิทธิ์สร้าง Draft" };
    const slotId = Number(formData.get("slotId"));
    if (!Number.isSafeInteger(slotId) || slotId < 1) return { status: "error", message: "Slot ไม่ถูกต้อง" };
    const item = (await loadFactoryReviewQueue({ includeApproved: true })).find((candidate) => candidate.slotId === slotId);
    if (!item || item.state !== "approved" || item.questionId !== null) {
      return { status: "error", message: "ข้อนี้ไม่ได้อยู่ในคิวอนุมัติแล้วรอสร้าง Draft" };
    }
    if (!item.mappingCandidate) {
      return { status: "error", message: item.mappingError ?? "ข้อนี้ยังไม่มี Product Mapping Candidate" };
    }
    const operationHash = createHash("sha256").update(JSON.stringify({
      slotId, stateVersion: item.stateVersion, checksum: item.mappingCandidate.checksum,
    })).digest("hex");
    const result = await publishFactoryDraft({
      runKey: item.runKey, slotKey: item.slotKey, expectedStateVersion: item.stateVersion,
      mappingCandidate: item.mappingCandidate, actorId: user.email.toLowerCase(),
      idempotencyKey: `draft-publication:${operationHash}`,
    });
    revalidatePath("/admin/question-factory/review");
    return {
      status: "success",
      message: result.replayed ? `Draft เดิม #${result.questionId} ถูกยืนยันแล้ว` : `สร้าง Draft #${result.questionId} แล้ว`,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "สร้าง Factory Draft ไม่สำเร็จ" };
  }
}

export async function submitAssetPromotion(
  _previous: HumanReviewActionState,
  formData: FormData
): Promise<HumanReviewActionState> {
  try {
    const user = await getUser();
    if (!user?.email || !isAdminEmail(user.email)) return { status: "error", message: "ไม่มีสิทธิ์โปรโมตภาพ" };
    const slotId = Number(formData.get("slotId"));
    if (!Number.isSafeInteger(slotId) || slotId < 1) return { status: "error", message: "Slot ไม่ถูกต้อง" };
    const item = (await loadFactoryReviewQueue({ includeApproved: true })).find((candidate) => candidate.slotId === slotId);
    if (!item || item.state !== "approved" || item.questionId === null || !item.asset || item.asset.state !== "qc_passed") {
      return { status: "error", message: "ข้อนี้ไม่ได้อยู่ในคิวโปรโมตภาพ" };
    }
    const operationHash = createHash("sha256").update(JSON.stringify({
      slotId, questionId: item.questionId, stateVersion: item.stateVersion,
      assetRevision: item.asset.revision, checksum: item.asset.checksum,
    })).digest("hex");
    const result = await promoteFactoryAsset({
      runKey: item.runKey, slotKey: item.slotKey, expectedStateVersion: item.stateVersion,
      questionId: item.questionId, assetRevision: item.asset.revision,
      stagingPath: item.asset.stagingPath,
      mimeType: item.asset.mimeType as "image/svg+xml" | "image/webp", checksum: item.asset.checksum,
      actorId: user.email.toLowerCase(), idempotencyKey: `asset-promotion:${operationHash}`,
    });
    revalidatePath("/admin/question-factory/review");
    return { status: "success", message: result.replayed ? "ยืนยันภาพ Product เดิมแล้ว" : `ผูกภาพกับ Draft #${result.questionId} แล้ว` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "โปรโมตภาพไม่สำเร็จ" };
  }
}

export async function submitDraftActivation(
  _previous: HumanReviewActionState,
  formData: FormData
): Promise<HumanReviewActionState> {
  try {
    const user = await getUser();
    if (!user?.email || !isAdminEmail(user.email)) return { status: "error", message: "ไม่มีสิทธิ์เปิดใช้ข้อสอบ" };
    if (formData.get("activationConfirmed") !== "activate") {
      return { status: "error", message: "กรุณายืนยันก่อนเปิดใช้ข้อสอบจริง" };
    }
    const slotId = Number(formData.get("slotId"));
    if (!Number.isSafeInteger(slotId) || slotId < 1) return { status: "error", message: "Slot ไม่ถูกต้อง" };
    const item = (await loadFactoryReviewQueue({ includeApproved: true })).find((candidate) => candidate.slotId === slotId);
    const assetReady = !item?.asset || item.asset.state === "promoted";
    if (!item || item.state !== "approved" || item.questionId === null || !item.mappingCandidate || !assetReady) {
      return { status: "error", message: "ข้อนี้ยังไม่ผ่านทุก gate สำหรับ Activation" };
    }
    const operationHash = createHash("sha256").update(JSON.stringify({
      slotId, questionId: item.questionId, stateVersion: item.stateVersion,
      mappingChecksum: item.mappingCandidate.checksum,
    })).digest("hex");
    const result = await activateFactoryDraft({
      runKey: item.runKey, slotKey: item.slotKey, expectedStateVersion: item.stateVersion,
      questionId: item.questionId, mappingChecksum: item.mappingCandidate.checksum,
      actorId: user.email.toLowerCase(), idempotencyKey: `draft-activation:${operationHash}`,
    });
    revalidatePath("/admin/question-factory/review");
    revalidatePath("/admin/question-factory");
    return { status: "success", message: result.replayed ? `ยืนยันข้อ Active #${result.questionId} แล้ว` : `เปิดใช้ข้อสอบ #${result.questionId} แล้ว` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "เปิดใช้ Factory Draft ไม่สำเร็จ" };
  }
}
