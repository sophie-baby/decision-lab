import type { Decision } from "./decision-domain";

type NewDecisionInput = Pick<Decision, "name" | "source" | "options" | "criteria" | "values">;

export function createOfferTemplate(name: string, makeId: () => string = () => crypto.randomUUID()): NewDecisionInput {
  const optionIds = [makeId(), makeId(), makeId()];
  const criterionIds = [makeId(), makeId(), makeId(), makeId()];
  return {
    name,
    source: "offer-template",
    options: ["A 公司", "B 公司", "C 公司"].map((option, index) => ({ id: optionIds[index], name: option, displayOrder: index })),
    criteria: [
      { id: criterionIds[0], name: "月薪", weight: 35, displayOrder: 0, type: "objective", unit: "k", direction: "higher", preferenceRule: { poor: 12, acceptable: 18, ideal: 28 } },
      { id: criterionIds[1], name: "通勤时间", weight: 15, displayOrder: 1, type: "objective", unit: "分钟", direction: "lower", preferenceRule: { poor: 40, acceptable: 30, ideal: 15 } },
      { id: criterionIds[2], name: "成长空间", weight: 30, displayOrder: 2, type: "subjective", scale: "five-level" },
      { id: criterionIds[3], name: "工作生活平衡", weight: 20, displayOrder: 3, type: "subjective", scale: "five-level" },
    ],
    values: [
      [24, 35, "very-good", "average"],
      [20, 22, "good", "very-good"],
      [27, 48, "very-good", "poor"],
    ].flatMap((row, optionIndex) => row.map((value, criterionIndex) => ({
      optionId: optionIds[optionIndex],
      criterionId: criterionIds[criterionIndex],
      value: value as number | "very-good" | "good" | "average" | "poor",
    }))),
  };
}

function createTemplate(
  name: string,
  source: "rent-template" | "laptop-template",
  optionNames: string[],
  criteria: Array<
    | { name: string; weight: number; type: "objective"; unit?: string; direction: "higher" | "lower"; preferenceRule: { poor: number; acceptable: number; ideal: number } }
    | { name: string; weight: number; type: "subjective"; scale: "five-level" }
  >,
  sampleValues: Array<Array<number | "very-poor" | "poor" | "average" | "good" | "very-good">>,
  makeId: () => string,
): NewDecisionInput {
  const optionIds = optionNames.map(() => makeId());
  const criterionIds = criteria.map(() => makeId());
  return {
    name,
    source,
    options: optionNames.map((optionName, displayOrder) => ({ id: optionIds[displayOrder], name: optionName, displayOrder })),
    criteria: criteria.map((criterion, displayOrder) => ({ ...criterion, id: criterionIds[displayOrder], displayOrder } as Decision["criteria"][number])),
    values: sampleValues.flatMap((row, optionIndex) => row.map((value, criterionIndex) => ({ optionId: optionIds[optionIndex], criterionId: criterionIds[criterionIndex], value }))),
  };
}

export function createRentTemplate(name: string, makeId: () => string = () => crypto.randomUUID()): NewDecisionInput {
  return createTemplate(name, "rent-template", ["房源 A", "房源 B", "房源 C"], [
    { name: "月租", weight: 30, type: "objective", unit: "元/月", direction: "lower", preferenceRule: { poor: 6500, acceptable: 5000, ideal: 3500 } },
    { name: "通勤时间", weight: 25, type: "objective", unit: "分钟", direction: "lower", preferenceRule: { poor: 60, acceptable: 40, ideal: 20 } },
    { name: "居住品质", weight: 25, type: "subjective", scale: "five-level" },
    { name: "周边便利", weight: 20, type: "subjective", scale: "five-level" },
  ], [[4200,45,"good","very-good"],[5200,25,"very-good","good"],[3500,60,"average","good"]], makeId);
}

export function createLaptopTemplate(name: string, makeId: () => string = () => crypto.randomUUID()): NewDecisionInput {
  return createTemplate(name, "laptop-template", ["笔记本 A", "笔记本 B", "笔记本 C"], [
    { name: "价格", weight: 25, type: "objective", unit: "元", direction: "lower", preferenceRule: { poor: 12000, acceptable: 8500, ideal: 5500 } },
    { name: "重量", weight: 20, type: "objective", unit: "kg", direction: "lower", preferenceRule: { poor: 2.2, acceptable: 1.6, ideal: 1.1 } },
    { name: "性能", weight: 35, type: "subjective", scale: "five-level" },
    { name: "续航与体验", weight: 20, type: "subjective", scale: "five-level" },
  ], [[6999,1.35,"good","very-good"],[8999,1.8,"very-good","good"],[5499,1.5,"average","good"]], makeId);
}

export function createPublicDemoDecision(): Decision {
  const optionIds = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
  ];
  const criterionIds = [
    "20000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000002",
    "20000000-0000-4000-8000-000000000003",
    "20000000-0000-4000-8000-000000000004",
  ];
  const factorScores = [[92, 88, 58, 72], [76, 72, 94, 86], [85, 96, 48, 54]];
  return {
    schemaVersion: 1,
    revision: 1,
    id: "30000000-0000-4000-8000-000000000001",
    name: "工作 Offer 完整示例",
    source: "demo-copy",
    createdAt: "2026-09-25T00:00:00.000Z",
    updatedAt: "2026-09-25T00:00:00.000Z",
    options: ["星河科技", "远山设计", "拓界智能"].map((name, index) => ({ id: optionIds[index], name, displayOrder: index })),
    criteria: ["薪资回报", "成长空间", "工作生活平衡", "通勤体验"].map((name, index) => ({
      id: criterionIds[index], name, weight: [35, 30, 20, 15][index], displayOrder: index,
      type: "objective" as const, direction: "higher" as const, unit: "分",
      preferenceRule: { poor: 20, acceptable: 60, ideal: 100 },
    })),
    values: factorScores.flatMap((row, optionIndex) => row.map((value, criterionIndex) => ({ optionId: optionIds[optionIndex], criterionId: criterionIds[criterionIndex], value }))),
  };
}
