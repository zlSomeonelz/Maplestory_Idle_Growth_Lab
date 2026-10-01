/**
 * Maple Growth Lab pure calculation engine.
 * All UI-free functions live here so the browser and regression tests use the
 * exact same formulas. Percent inputs are display percentages (e.g. 20 = 20%).
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
export const pct = value => 1 + (Number(value) || 0) / 100;

// 점감 능력치: 기본값과 추가 옵션을 상한까지 남은 구간에 곱연산한다.
// 예: 공격 속도 100% + 20% = 100 + (150-100) * 20/150 = 106.67%.
export function diminishingSum(base, additions = [], cap) {
  const limit = Math.max(0, Number(cap) || 0);
  let effective = clamp(base, 0, limit);
  for (const addition of additions || []) {
    const extra = clamp(addition, 0, limit);
    effective = limit - (limit - effective) * (1 - extra / limit);
  }
  return effective;
}

export function calculateDamage(s, rules = {}) {
  const attack = (Number(s.attackFlat) || 0) * pct(s.attackPct);
  const targetDefense = Math.max(0, Number(s.targetDefense) || 0);
  const defPenCap = Number(rules?.caps?.defensePenetration || 1000) / 10;
  const defPen = diminishingSum(s.defPen, s.defPenAdditions, defPenCap);
  const afterDef = targetDefense * (1 - defPen / 100);
  // Official guide: attack * 5000 / (defenseAfterPenetration + 6000).
  const defenseFactor = targetDefense > 0 ? 5000 / (afterDef + 6000) : 1;
  const targetBonus = s.target === 'boss' ? Number(s.bossDamage) || 0 : s.target === 'normal' ? Number(s.normalDamage) || 0 : 0;
  const critChance = clamp((Number(s.critRate) || 0) / 100, 0, 1);
  const critFactor = 1 + critChance * ((Number(s.critDamage) || 0) / 100);
  const min = Number(s.minDamage) > 0 ? Number(s.minDamage) / 100 : 1;
  const max = Number(s.maxDamage) > 0 ? Number(s.maxDamage) / 100 : 1;
  const rangeFactor = (min + Math.max(min, max)) / 2;
  const accuracyFactor = clamp((Number(s.accuracy) || 0) / 100, 0, 1);
  const base = attack * defenseFactor * pct(s.targetTaken) * pct(s.damage) * pct(s.damageAmp) * pct(targetBonus) * pct((Number(s.basicDamage) || 0) + (Number(s.skillDamage) || 0)) * pct((Number(s.statBased) || 0) * 100) * pct(s.mastery) * critFactor * rangeFactor * pct(s.finalDamage) * ((Number(s.skillCoefficient) || 0) / 100) * accuracyFactor;
  // Attack-speed conversion is intentionally labeled provisional until the
  // official action-interval table is encoded; keep it isolated and visible.
  const attackSpeedCap = Number(rules?.caps?.attackSpeed || 1500) / 10;
  const effectiveAttackSpeed = diminishingSum(s.attackSpeed, s.attackSpeedAdditions, attackSpeedCap);
  const speedFactor = 1 + effectiveAttackSpeed / 100;
  const interval = Number(s.attackInterval) || 0;
  const dps = interval > 0 ? base * speedFactor / interval : 0;
  return {
    average: base,
    min: base * (min / Math.max(rangeFactor, 0.0001)),
    max: base * (Math.max(min, max) / Math.max(rangeFactor, 0.0001)),
    dps,
    attack,
    effectiveAttackSpeed,
    afterDef,
    effectiveDefPen: defPen,
    defenseFactor,
    statBased: Number(s.statBased) || 0,
    critChance,
    targetBonus,
    speedFactor,
    capsApplied: { defPen: defPenCap, attackSpeed: attackSpeedCap },
  };
}

export function probabilitySummary(ratePercent, attempts, cost = 0) {
  const p = clamp((Number(ratePercent) || 0) / 100, 0, 1);
  const tries = Math.max(0, Math.floor(Number(attempts) || 0));
  if (!p) return { probability: 0, expectedAttempts: Infinity, expectedCost: null, need90: Infinity, need95: Infinity, attempts: tries };
  const achieved = 1 - Math.pow(1 - p, tries);
  const needed = target => p === 1 ? 1 : Math.ceil(Math.log(1 - target) / Math.log(1 - p));
  const expectedAttempts = 1 / p;
  return { probability: achieved, expectedAttempts, expectedCost: cost ? expectedAttempts * Number(cost) : null, need90: needed(.9), need95: needed(.95), attempts: tries };
}
