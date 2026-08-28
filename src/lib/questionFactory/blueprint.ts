import { createHash } from "node:crypto";

export type WeightedTarget<T extends string | number> = { value: T; weight: number };

export type BuildFactoryBlueprintInput = {
  blueprintId: string;
  blueprintVersion: string;
  scopeKey: string;
  profileId: string;
  profileVersion: string;
  auditChecksum: string;
  activeCount: number;
  minimumActive: number;
  maxGeneratedItems: number;
  difficultyMix: Array<WeightedTarget<1 | 2 | 3>>;
  objectiveMix: Array<WeightedTarget<string>>;
  topicByObjective: Record<string, string>;
  cognitiveDemandMix: Array<WeightedTarget<"recall" | "understand" | "apply" | "analyze" | "evaluate">>;
  archetypeMix: Array<WeightedTarget<string>>;
  representationMix: Array<WeightedTarget<"none" | "svg_geometry" | "svg_graph" | "svg_scientific_diagram">>;
};

export type FactoryBlueprintSlot = {
  slotKey: string;
  ordinal: number;
  slotSpec: {
    learningObjective: string;
    topic: string;
    difficulty: 1 | 2 | 3;
    cognitiveDemand: "recall" | "understand" | "apply" | "analyze" | "evaluate";
    questionArchetype: string;
    representationType: "none" | "svg_geometry" | "svg_graph" | "svg_scientific_diagram";
    answerType: "single_choice";
  };
};

export type ResolvedFactoryBlueprint = {
  schemaVersion: "question-factory-blueprint/v1";
  blueprintId: string;
  blueprintVersion: string;
  scopeKey: string;
  profileId: string;
  profileVersion: string;
  auditChecksum: string;
  activeCount: number;
  minimumActive: number;
  requiredNewActive: number;
  slots: FactoryBlueprintSlot[];
  checksum: string;
};

function assertTargets<T extends string | number>(targets: Array<WeightedTarget<T>>, name: string): void {
  if (!targets.length) throw new Error(`${name} requires at least one target`);
  const values = new Set<string>();
  for (const target of targets) {
    if (!Number.isFinite(target.weight) || target.weight <= 0) throw new Error(`${name} weights must be positive`);
    const key = String(target.value);
    if (values.has(key)) throw new Error(`${name} values must be unique`);
    values.add(key);
  }
}

function allocate<T extends string | number>(count: number, targets: Array<WeightedTarget<T>>): T[] {
  if (count === 0) return [];
  const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0);
  const rows = targets.map((target, index) => {
    const exact = count * target.weight / totalWeight;
    return { ...target, index, allocated: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = count - rows.reduce((sum, row) => sum + row.allocated, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- <= 0) break;
    row.allocated += 1;
  }
  const result: T[] = [];
  while (result.length < count) {
    for (const row of rows) if (row.allocated > 0) {
      result.push(row.value);
      row.allocated -= 1;
    }
  }
  return result;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function buildFactoryBlueprint(input: BuildFactoryBlueprintInput): ResolvedFactoryBlueprint {
  if (!input.blueprintId.trim() || !input.blueprintVersion.trim()) throw new Error("Blueprint identity is required");
  if (!input.scopeKey.trim() || !input.profileId.trim() || !input.profileVersion.trim()) throw new Error("Pinned scope/profile identity is required");
  if (!/^sha256:[0-9a-f]{64}$/.test(input.auditChecksum)) throw new Error("Invalid audit checksum");
  if (!Number.isSafeInteger(input.activeCount) || input.activeCount < 0) throw new Error("activeCount must be nonnegative");
  if (!Number.isSafeInteger(input.minimumActive) || input.minimumActive <= 0) throw new Error("minimumActive must be positive");
  if (!Number.isSafeInteger(input.maxGeneratedItems) || input.maxGeneratedItems <= 0) throw new Error("maxGeneratedItems must be positive");
  assertTargets(input.difficultyMix, "difficultyMix");
  assertTargets(input.objectiveMix, "objectiveMix");
  assertTargets(input.cognitiveDemandMix, "cognitiveDemandMix");
  assertTargets(input.archetypeMix, "archetypeMix");
  assertTargets(input.representationMix, "representationMix");
  if (input.difficultyMix.some(({ value }) => value !== 1 && value !== 2 && value !== 3)) {
    throw new Error("difficultyMix supports only Product Adapter v1 difficulties 1-3");
  }
  if (input.objectiveMix.some(({ value }) => !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(value))) {
    throw new Error("objectiveMix requires stable 1-64 character machine identifiers");
  }
  for (const { value } of input.objectiveMix) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(input.topicByObjective[value] ?? "")) {
      throw new Error(`Objective ${value} requires a stable topic identifier`);
    }
  }
  const cognitiveDemands = new Set(["recall", "understand", "apply", "analyze", "evaluate"]);
  if (input.cognitiveDemandMix.some(({ value }) => !cognitiveDemands.has(value))) {
    throw new Error("cognitiveDemandMix contains an unsupported value");
  }
  if (input.archetypeMix.some(({ value }) => !/^[a-z][a-z0-9_]{0,63}$/.test(value))) {
    throw new Error("archetypeMix requires stable lowercase machine identifiers");
  }
  const representations = new Set(["none", "svg_geometry", "svg_graph", "svg_scientific_diagram"]);
  if (input.representationMix.some(({ value }) => !representations.has(value))) {
    throw new Error("representationMix contains an unsupported representation");
  }

  const requiredNewActive = Math.max(0, input.minimumActive - input.activeCount);
  if (requiredNewActive > input.maxGeneratedItems) throw new Error("Coverage gap exceeds maxGeneratedItems");
  const difficulties = allocate(requiredNewActive, input.difficultyMix);
  const objectives = allocate(requiredNewActive, input.objectiveMix);
  const cognitiveDemandsPlan = allocate(requiredNewActive, input.cognitiveDemandMix);
  const archetypePlan = allocate(requiredNewActive, input.archetypeMix);
  const representationPlan = allocate(requiredNewActive, input.representationMix);
  const slots = Array.from({ length: requiredNewActive }, (_, index): FactoryBlueprintSlot => ({
    slotKey: `slot_${String(index + 1).padStart(4, "0")}`,
    ordinal: index + 1,
    slotSpec: {
      learningObjective: objectives[index], topic: input.topicByObjective[objectives[index]],
      difficulty: difficulties[index], cognitiveDemand: cognitiveDemandsPlan[index],
      questionArchetype: archetypePlan[index],
      representationType: representationPlan[index], answerType: "single_choice",
    },
  }));
  const withoutChecksum = {
    schemaVersion: "question-factory-blueprint/v1" as const,
    blueprintId: input.blueprintId, blueprintVersion: input.blueprintVersion,
    scopeKey: input.scopeKey, profileId: input.profileId, profileVersion: input.profileVersion,
    auditChecksum: input.auditChecksum, activeCount: input.activeCount,
    minimumActive: input.minimumActive, requiredNewActive, slots,
  };
  const checksum = `sha256:${createHash("sha256").update(canonicalJson(withoutChecksum)).digest("hex")}`;
  return { ...withoutChecksum, checksum };
}
