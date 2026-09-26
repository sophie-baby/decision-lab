export type SubjectiveRating = "very-poor" | "poor" | "average" | "good" | "very-good";
export type PreferenceRule = { poor: number; acceptable: number; ideal: number };
export type Criterion = {
  id: string; name: string; weight: number; displayOrder: number;
} & ({ type: "objective"; unit?: string; direction: "higher" | "lower"; preferenceRule: PreferenceRule }
  | { type: "subjective"; scale: "five-level" });
export type Decision = {
  schemaVersion: 1; revision: number; id: string; name: string; description?: string;
  source: "blank" | "offer-template" | "rent-template" | "laptop-template" | "demo-copy";
  options: { id: string; name: string; displayOrder: number }[];
  criteria: Criterion[];
  values: { optionId: string; criterionId: string; value: number | SubjectiveRating | null }[];
  createdAt: string; updatedAt: string;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreObjective(raw: number, rule: PreferenceRule, direction: "higher" | "lower") {
  if (![raw, rule.poor, rule.acceptable, rule.ideal].every(Number.isFinite)) throw new Error("数值必须为有限数字");
  const valid = direction === "higher" ? rule.poor < rule.acceptable && rule.acceptable < rule.ideal : rule.ideal < rule.acceptable && rule.acceptable < rule.poor;
  if (!valid) throw new Error("偏好锚点顺序无效");
  if (direction === "higher") {
    if (raw >= rule.ideal) return 100;
    if (raw >= rule.acceptable) return 60 + (raw - rule.acceptable) / (rule.ideal - rule.acceptable) * 40;
    return clamp(20 + (raw - rule.poor) / (rule.acceptable - rule.poor) * 40);
  }
  if (raw <= rule.ideal) return 100;
  if (raw <= rule.acceptable) return 100 - (raw - rule.ideal) / (rule.acceptable - rule.ideal) * 40;
  return clamp(60 - (raw - rule.acceptable) / (rule.poor - rule.acceptable) * 40);
}

export function scoreSubjective(rating: SubjectiveRating) {
  return ({ "very-poor": 0, poor: 25, average: 50, good: 75, "very-good": 100 })[rating];
}

export function calculateDecision(decision: Decision, overrides?: Record<string, number>) {
  const weights = decision.criteria.map(c => overrides?.[c.id] ?? c.weight);
  if (weights.some(w => !Number.isFinite(w) || w < 0)) throw new Error("重要程度必须是非负有限数字");
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) throw new Error("重要程度合计不能为 0");
  const valueByPair = new Map(decision.values.map(value => [`${value.optionId}:${value.criterionId}`, value.value]));
  const options = decision.options.map(option => {
    const details = decision.criteria.map((criterion, index) => {
      const raw = valueByPair.get(`${option.id}:${criterion.id}`);
      if (raw == null) throw new Error(`${option.name}缺少${criterion.name}数据`);
      const preferenceScore = criterion.type === "objective"
        ? scoreObjective(Number(raw), criterion.preferenceRule, criterion.direction)
        : scoreSubjective(raw as SubjectiveRating);
      const normalizedWeight = weights[index] / total;
      return { criterionId: criterion.id, raw, preferenceScore, normalizedWeight, contribution: preferenceScore * normalizedWeight };
    });
    return { ...option, details, score: details.reduce((sum, item) => sum + item.contribution, 0) };
  });
  const sorted = options.sort((a, b) => Number(b.score.toFixed(2)) - Number(a.score.toFixed(2)) || a.displayOrder - b.displayOrder);
  let previousDisplayScore: number | undefined;
  let previousRank = 0;
  return sorted.map((option, index) => {
    const displayScore = Number(option.score.toFixed(2));
    const rank = displayScore === previousDisplayScore ? previousRank : index + 1;
    previousDisplayScore = displayScore;
    previousRank = rank;
    return { ...option, displayScore, rank };
  });
}

export type SensitivityResult = {
  criterionId: string;
  currentWeight: number;
  thresholdWeight: number | null;
  direction: "increase" | "decrease" | null;
  newLeaderId: string | null;
  distance: number | null;
};

export function analyzeSensitivity(decision: Decision): SensitivityResult[] {
  const base = calculateDecision(decision);
  const baseLeaderIds = base.filter(item => item.rank === 1).map(item => item.id).sort().join(",");
  const normalized = normalizeWeightRecord(Object.fromEntries(decision.criteria.map(item => [item.id, item.weight])));
  return decision.criteria.map(criterion => {
    const current = normalized[criterion.id];
    const center = Math.round(current);
    let nearest: { weight: number; leaderId: string | null; distance: number } | undefined;
    const candidateWeights = Array.from({ length: 101 }, (_, weight) => weight)
      .filter(weight => weight !== center)
      .sort((left, right) => Math.abs(left - current) - Math.abs(right - current) || left - right);
    for (const weight of candidateWeights) {
      let result: ReturnType<typeof calculateDecision>;
      try { result = calculateDecision(decision, rebalanceWeightRecord(normalized, criterion.id, weight)); } catch { continue; }
      const leaders = result.filter(item => item.rank === 1);
      const leaderIds = leaders.map(item => item.id).sort().join(",");
      if (leaderIds !== baseLeaderIds) {
        nearest = { weight, leaderId: leaders.length === 1 ? leaders[0].id : null, distance: Math.abs(weight - current) };
        break;
      }
    }
    const direction: SensitivityResult["direction"] = nearest ? (nearest.weight > normalized[criterion.id] ? "increase" : "decrease") : null;
    return {
      criterionId: criterion.id,
      currentWeight: normalized[criterion.id],
      thresholdWeight: nearest?.weight ?? null,
      direction,
      newLeaderId: nearest?.leaderId ?? null,
      distance: nearest?.distance ?? null,
    };
  }).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || decision.criteria.findIndex(item => item.id === a.criterionId) - decision.criteria.findIndex(item => item.id === b.criterionId));
}

export function normalizeWeightRecord(weights: Record<string, number>, total = 100) {
  const entries = Object.entries(weights);
  const sum = entries.reduce((value, [, weight]) => value + weight, 0);
  if (!entries.length || !Number.isFinite(sum) || sum <= 0) return Object.fromEntries(entries.map(([id]) => [id, 0]));
  return Object.fromEntries(entries.map(([id, weight]) => [id, weight / sum * total]));
}

export function rebalanceWeightRecord(weights: Record<string, number>, changedId: string, nextWeight: number, total = 100) {
  const ids = Object.keys(weights);
  if (!ids.includes(changedId)) return { ...weights };
  if (ids.length === 1) return { [changedId]: total };
  const next = Math.max(0, Math.min(total, nextWeight));
  const remainingIds = ids.filter(id => id !== changedId);
  const remainingTotal = remainingIds.reduce((sum, id) => sum + Math.max(0, weights[id] ?? 0), 0);
  const available = total - next;
  const result: Record<string, number> = { [changedId]: next };
  remainingIds.forEach(id => { result[id] = remainingTotal > 0 ? Math.max(0, weights[id] ?? 0) / remainingTotal * available : available / remainingIds.length; });
  return result;
}

export type ScenarioDriver = { criterionId: string; marginDelta: number };

export function compareScenario(decision: Decision, overrides: Record<string, number>, baseResult?: ReturnType<typeof calculateDecision>) {
  const base = baseResult ?? calculateDecision(decision);
  const scenario = calculateDecision(decision, overrides);
  const baseById = new Map(base.map(option => [option.id, option]));
  const scenarioById = new Map(scenario.map(option => [option.id, option]));
  const changes = decision.options.map(option => {
    const before = baseById.get(option.id)!;
    const after = scenarioById.get(option.id)!;
    return {
      optionId: option.id,
      oldRank: before.rank,
      newRank: after.rank,
      rankDelta: before.rank - after.rank,
      contributionChanges: decision.criteria.map(criterion => ({
        criterionId: criterion.id,
        delta: after.details.find(detail => detail.criterionId === criterion.id)!.contribution - before.details.find(detail => detail.criterionId === criterion.id)!.contribution,
      })),
    };
  });

  const rankingChanged = changes.some(change => change.oldRank !== change.newRank);
  let pair: [string, string] | null = null;
  const oldLeader = base[0];
  const newLeader = scenario[0];
  if (oldLeader.id !== newLeader.id) {
    pair = [newLeader.id, oldLeader.id];
  } else if (rankingChanged) {
    const originalIndex = new Map(decision.options.map((option, index) => [option.id, index]));
    const movers = changes.filter(change => change.rankDelta !== 0);
    const candidates: { pair: [string, string]; displacement: number; order: number }[] = [];
    for (let left = 0; left < movers.length; left++) for (let right = left + 1; right < movers.length; right++) {
      if (movers[left].rankDelta * movers[right].rankDelta < 0) {
        candidates.push({
          pair: movers[left].rankDelta > 0 ? [movers[left].optionId, movers[right].optionId] : [movers[right].optionId, movers[left].optionId],
          displacement: Math.abs(movers[left].rankDelta) + Math.abs(movers[right].rankDelta),
          order: Math.min(originalIndex.get(movers[left].optionId)!, originalIndex.get(movers[right].optionId)!),
        });
      }
    }
    pair = candidates.sort((a, b) => b.displacement - a.displacement || a.order - b.order)[0]?.pair ?? null;
  }

  const drivers: ScenarioDriver[] = pair ? decision.criteria.map(criterion => {
    const [aheadId, behindId] = pair!;
    const contribution = (result: typeof base, optionId: string) => result.find(option => option.id === optionId)!.details.find(detail => detail.criterionId === criterion.id)!.contribution;
    return {
      criterionId: criterion.id,
      marginDelta: contribution(scenario, aheadId) - contribution(scenario, behindId) - contribution(base, aheadId) + contribution(base, behindId),
    };
  }).sort((a, b) => Math.abs(b.marginDelta) - Math.abs(a.marginDelta) || decision.criteria.findIndex(item => item.id === a.criterionId) - decision.criteria.findIndex(item => item.id === b.criterionId)).slice(0, 2) : [];

  return { base, scenario, changes, rankingChanged, comparedOptionIds: pair, drivers };
}

export type TradeoffItem = {
  criterionId: string;
  preferenceScore: number;
  normalizedWeight: number;
  impact: number;
};

export type OptionTradeoff = {
  optionId: string;
  strengths: TradeoffItem[];
  tradeoffs: TradeoffItem[];
};

export function analyzeTradeoffs(result: ReturnType<typeof calculateDecision>): OptionTradeoff[] {
  const rank = (items: TradeoffItem[]) => items
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2);

  return result.map(option => {
    const items = option.details.map(detail => ({
      criterionId: detail.criterionId,
      preferenceScore: detail.preferenceScore,
      normalizedWeight: detail.normalizedWeight,
      impact: Math.abs(detail.preferenceScore - 60) * detail.normalizedWeight,
    }));
    return {
      optionId: option.id,
      strengths: rank(items.filter(item => item.preferenceScore >= 75)),
      tradeoffs: rank(items.filter(item => item.preferenceScore <= 40)),
    };
  });
}

export function distributeWeights(count: number) {
  if (count < 1) return [];
  const each = Math.round(10000 / count) / 100;
  const result = Array.from({ length: count }, () => each);
  result[count - 1] = Math.round((100 - result.slice(0, -1).reduce((a, b) => a + b, 0)) * 100) / 100;
  return result;
}

export function normalizeWeightsToHundred(weights: number[]) {
  if (weights.some(weight => !Number.isFinite(weight) || weight < 0)) throw new Error("重要程度必须是非负有限数字");
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!total) return null;
  let used = 0;
  return weights.map((weight, index) => {
    const normalized = index === weights.length - 1
      ? Math.round((100 - used) * 100) / 100
      : Math.round(weight / total * 10000) / 100;
    used += normalized;
    return normalized;
  });
}

export function formatRank(rank: number, tied: boolean) {
  return tied ? `并列第 ${rank} 名` : `第 ${rank} 名`;
}

export function reorderByDisplayOrder<T extends { id: string; displayOrder: number }>(items: T[], id: string, delta: -1 | 1) {
  const from = items.findIndex(item => item.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next.map((item, index) => ({ ...item, displayOrder: index }));
}

export function convertCriterionType(decision: Decision, criterionId: string, type: "objective" | "subjective"): Decision {
  const current = decision.criteria.find(criterion => criterion.id === criterionId);
  if (!current || current.type === type) return decision;
  return {
    ...decision,
    criteria: decision.criteria.map(criterion => {
      if (criterion.id !== criterionId) return criterion;
      const base = { id: criterion.id, name: criterion.name, weight: criterion.weight, displayOrder: criterion.displayOrder };
      return type === "objective"
        ? { ...base, type: "objective" as const, direction: "higher" as const, unit: "", preferenceRule: { poor: 0, acceptable: 50, ideal: 100 } }
        : { ...base, type: "subjective" as const, scale: "five-level" as const };
    }),
    values: decision.values.map(value => value.criterionId === criterionId ? { ...value, value: null } : value),
  };
}
