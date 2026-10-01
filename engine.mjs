/**
 * Maple Growth Lab pure calculation engine.
 * All UI-free functions live here so the browser and regression tests use the
 * exact same formulas. Percent inputs are display percentages (e.g. 20 = 20%).
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
export const pct = value => 1 + (Number(value) || 0) / 100;

export function calculateDamage(s) {
  const attack = (Number(s.attackFlat) || 0) * pct(s.attackPct);
  const targetDefense = Math.max(0, Number(s.targetDefense) || 0);
  const defPen = clamp(s.defPen, 0, 100);
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
  const speedFactor = 1 + (Number(s.attackSpeed) || 0) / 100;
  const interval = Number(s.attackInterval) || 0;
  const dps = interval > 0 ? base * speedFactor / interval : 0;
  return {
    average: base,
    min: base * (min / Math.max(rangeFactor, 0.0001)),
    max: base * (Math.max(min, max) / Math.max(rangeFactor, 0.0001)),
    dps,
    attack,
    afterDef,
    defenseFactor,
    statBased: Number(s.statBased) || 0,
    critChance,
    targetBonus,
    speedFactor,
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
