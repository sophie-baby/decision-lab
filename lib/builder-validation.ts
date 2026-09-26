import type { Decision } from "./decision-domain";

export type BuilderStep = "options" | "criteria" | "matrix" | "preferences" | "weights";
export type StepError = { key: string; message: string };

export function validateBuilderStep(decision: Decision, step: BuilderStep): StepError[] {
  if (step === "options") {
    return decision.options.flatMap(option => option.name.trim() ? [] : [{ key: `option-${option.id}`, message: "方案名称不能为空" }]);
  }
  if (step === "criteria") {
    return decision.criteria.flatMap(criterion => criterion.name.trim() ? [] : [{ key: `criterion-${criterion.id}`, message: "因素名称不能为空" }]);
  }
  if (step === "matrix") {
    const criteria = new Map(decision.criteria.map(criterion => [criterion.id, criterion]));
    return decision.values.flatMap(value => {
      if (value.value === null) return [];
      const criterion = criteria.get(value.criterionId);
      const valid = criterion?.type === "objective" ? typeof value.value === "number" && Number.isFinite(value.value) : typeof value.value === "string";
      return valid ? [] : [{ key: `value-${value.optionId}-${value.criterionId}`, message: "方案数据与因素类型不匹配" }];
    });
  }
  if (step === "preferences") {
    return decision.criteria.flatMap(criterion => {
      if (criterion.type !== "objective") return [];
      const { poor, acceptable, ideal } = criterion.preferenceRule;
      const valid = [poor, acceptable, ideal].every(Number.isFinite) &&
        (criterion.direction === "higher" ? poor < acceptable && acceptable < ideal : ideal < acceptable && acceptable < poor);
      return valid ? [] : [{ key: `preference-${criterion.id}`, message: `${criterion.name}的偏好锚点顺序无效` }];
    });
  }
  return decision.criteria.flatMap(criterion => Number.isFinite(criterion.weight) && criterion.weight >= 0 ? [] : [{ key: `weight-${criterion.id}`, message: "重要程度必须为非负有限数字" }]);
}
