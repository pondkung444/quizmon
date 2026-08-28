import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCT_MAPPING_VERSION, type ProductCategoryMappingEntry } from "@/lib/questionFactory/productMapping";
import type { QuestionFactoryEducationStage, QuestionFactorySubject } from "@/lib/questionFactory/scopeKey";

type RegistryRow = {
  mapping_id: string; mapping_version: string; chapter_key: string; topic_id: string;
  education_stage: string; factory_subject: string; grade_band: string;
  product_subject: string; branch: string | null; product_category: string;
};

export async function resolveProductCategoryMapping(input: {
  chapterKey: string; topicId: string; stage: QuestionFactoryEducationStage; subject: QuestionFactorySubject;
}): Promise<ProductCategoryMappingEntry> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("question_factory_category_registry")
    .select("mapping_id, mapping_version, chapter_key, topic_id, education_stage, factory_subject, grade_band, product_subject, branch, product_category")
    .eq("mapping_version", PRODUCT_MAPPING_VERSION).eq("chapter_key", input.chapterKey)
    .eq("topic_id", input.topicId).eq("education_stage", input.stage)
    .eq("factory_subject", input.subject).limit(2);
  if (error) throw new Error(`Unable to resolve product category mapping: ${error.message}`);
  if (!data || data.length !== 1) {
    throw new Error(data?.length ? "Ambiguous product category mapping" : "Unknown approved product category mapping");
  }
  const row = data[0] as RegistryRow;
  if (row.mapping_version !== PRODUCT_MAPPING_VERSION || row.chapter_key !== input.chapterKey ||
      row.topic_id !== input.topicId || row.education_stage !== input.stage ||
      row.factory_subject !== input.subject || !row.product_category.trim()) {
    throw new Error("Product category registry row failed the Factory mapping contract");
  }
  return {
    id: row.mapping_id, mappingVersion: PRODUCT_MAPPING_VERSION, chapterKey: row.chapter_key,
    stage: input.stage, subject: input.subject, topicId: row.topic_id,
    gradeBand: row.grade_band as ProductCategoryMappingEntry["gradeBand"],
    productSubject: row.product_subject as ProductCategoryMappingEntry["productSubject"],
    branch: row.branch as ProductCategoryMappingEntry["branch"], category: row.product_category,
  };
}
