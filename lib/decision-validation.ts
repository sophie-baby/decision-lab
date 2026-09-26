import { z } from "zod";
import type { Decision } from "./decision-domain";

const subjectiveRatings = ["very-poor", "poor", "average", "good", "very-good"] as const;
const uuid = z.string().uuid();
const trimmedName = z.string().trim().min(1).max(100);
const order = z.number().int().nonnegative();

const optionSchema = z.object({
  id: uuid,
  name: trimmedName,
  displayOrder: order,
});

const criterionBase = {
  id: uuid,
  name: trimmedName,
  weight: z.number().finite(),
  displayOrder: order,
};

const objectiveCriterionSchema = z.object({
  ...criterionBase,
  type: z.literal("objective"),
  unit: z.string().optional(),
  direction: z.enum(["higher", "lower"]),
  preferenceRule: z.object({
    poor: z.number().finite().nullable(),
    acceptable: z.number().finite().nullable(),
    ideal: z.number().finite().nullable(),
  }),
});

const subjectiveCriterionSchema = z.object({
  ...criterionBase,
  type: z.literal("subjective"),
  scale: z.literal("five-level"),
});

const criterionSchema = z.discriminatedUnion("type", [objectiveCriterionSchema, subjectiveCriterionSchema]);
const optionValueSchema = z.object({
  optionId: uuid,
  criterionId: uuid,
  value: z.union([z.number().finite(), z.enum(subjectiveRatings)]).nullable(),
});

const decisionShape = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  id: uuid,
  name: trimmedName,
  description: z.string().optional(),
  source: z.enum(["blank", "offer-template", "rent-template", "laptop-template", "demo-copy"]),
  options: z.array(optionSchema).max(10),
  criteria: z.array(criterionSchema).max(30),
  values: z.array(optionValueSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const FormSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  options: z.array(z.object({ id: z.string(), name: z.string(), displayOrder: z.union([z.number(), z.string()]) })),
  criteria: z.array(z.unknown()),
  values: z.array(z.object({
    optionId: z.string(),
    criterionId: z.string(),
    value: z.union([z.number(), z.string(), z.null()]),
  })),
}).passthrough();

export const DraftSchema = decisionShape.superRefine((decision, context) => {
  const optionIds = new Set(decision.options.map(option => option.id));
  const criteria = new Map(decision.criteria.map(criterion => [criterion.id, criterion]));
  const pairs = new Set<string>();

  decision.values.forEach((item, index) => {
    const pair = `${item.optionId}:${item.criterionId}`;
    if (pairs.has(pair)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["values", index], message: "同一方案与因素只能有一个值" });
    }
    pairs.add(pair);
    if (!optionIds.has(item.optionId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["values", index, "optionId"], message: "方案引用不存在" });
    }
    const criterion = criteria.get(item.criterionId);
    if (!criterion) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["values", index, "criterionId"], message: "因素引用不存在" });
    } else if (item.value !== null) {
      const valid = criterion.type === "objective"
        ? typeof item.value === "number"
        : typeof item.value === "string" && subjectiveRatings.includes(item.value as typeof subjectiveRatings[number]);
      if (!valid) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["values", index, "value"], message: "值与因素类型不匹配" });
      }
    }
  });
});

export const CompleteDecisionSchema = DraftSchema.superRefine((decision, context) => {
  if (decision.options.length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "至少需要两个方案" });
  }
  if (decision.criteria.length < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria"], message: "至少需要一个因素" });
  }
  if (decision.criteria.some(criterion => criterion.weight < 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria"], message: "重要程度必须为非负有限数字" });
  }
  if (decision.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria"], message: "重要程度合计必须大于 0" });
  }

  const values = new Map(decision.values.map(item => [`${item.optionId}:${item.criterionId}`, item.value]));
  decision.options.forEach((option, optionIndex) => decision.criteria.forEach((criterion, criterionIndex) => {
    if (values.get(`${option.id}:${criterion.id}`) == null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["values"], message: `方案 ${optionIndex + 1} 的因素 ${criterionIndex + 1} 尚未填写` });
    }
  }));

  decision.criteria.forEach((criterion, index) => {
    if (criterion.type !== "objective") return;
    const { poor, acceptable, ideal } = criterion.preferenceRule;
    const valid = poor !== null && acceptable !== null && ideal !== null &&
      (criterion.direction === "higher" ? poor < acceptable && acceptable < ideal : ideal < acceptable && acceptable < poor);
    if (!valid) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria", index, "preferenceRule"], message: "偏好锚点顺序无效" });
    }
  });
});

export type MissingDecisionItem = {
  code: "options" | "criteria" | "value" | "preference" | "weight";
  message: string;
  editPath: "options" | "criteria" | "matrix" | "preferences" | "weights";
  optionId?: string;
  criterionId?: string;
};

export function getMissingDecisionItems(input: unknown): MissingDecisionItem[] {
  const parsed = DraftSchema.safeParse(input);
  if (!parsed.success) return [];
  return getMissingDecisionItemsFromDecision(parsed.data as Decision);
}

export function getMissingDecisionItemsFromDecision(decision: Decision): MissingDecisionItem[] {
  const missing: MissingDecisionItem[] = [];
  if (decision.options.length < 2) missing.push({ code: "options", message: "至少添加两个方案", editPath: "options" });
  if (!decision.criteria.length) missing.push({ code: "criteria", message: "至少添加一个因素", editPath: "criteria" });

  const values = new Map(decision.values.map(item => [`${item.optionId}:${item.criterionId}`, item.value]));
  for (const option of decision.options) for (const criterion of decision.criteria) {
    if (values.get(`${option.id}:${criterion.id}`) == null) {
      missing.push({ code: "value", message: `${option.name}的${criterion.name}尚未填写`, editPath: "matrix", optionId: option.id, criterionId: criterion.id });
    }
  }
  for (const criterion of decision.criteria) {
    if (criterion.type !== "objective") continue;
    const { poor, acceptable, ideal } = criterion.preferenceRule;
    const valid = poor !== null && acceptable !== null && ideal !== null &&
      (criterion.direction === "higher" ? poor < acceptable && acceptable < ideal : ideal < acceptable && acceptable < poor);
    if (!valid) missing.push({ code: "preference", message: `${criterion.name}的偏好锚点无效`, editPath: "preferences", criterionId: criterion.id });
  }
  if (decision.criteria.some(criterion => criterion.weight < 0) || decision.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) <= 0) {
    missing.push({ code: "weight", message: "重要程度必须非负且合计大于 0", editPath: "weights" });
  }
  return missing;
}
