/**
 * Maple Growth Lab pure calculation engine.
 * UI-facing percentage inputs use display values (20 = 20%).
 * The battle-power formula converts those values to the official 1,000-scale
 * stat values internally.
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
export const pct = value => 1 + (Number(value) || 0) / 100;

// 점감 능력치: 기본값과 추가 옵션을 상한까지 남은 구간에 곱연산한다.
export function diminishingSum(base, additions = [], cap) {
  const limit = Math.max(0, Number(cap) || 0);
  let effective = clamp(base, 0, limit);
  for (const addition of additions || []) {
    const extra = clamp(addition, 0, limit);
    effective = limit ? limit - (limit - effective) * (1 - extra / limit) : 0;
  }
  return effective;
}

/**
 * DPS is intentionally isolated from one-hit damage.
 * Attack-speed conversion remains provisional until the official action table
 * is encoded; the cap and the applied result are returned for transparency.
 */
export function calculateDps(averageDamage, s, rules = {}) {
  const attackSpeedCap = Number(rules?.caps?.attackSpeed || 1500) / 10;
  const effectiveAttackSpeed = diminishingSum(s.attackSpeed, s.attackSpeedAdditions, attackSpeedCap);
  const speedFactor = 1 + effectiveAttackSpeed / 100;
  const interval = Number(s.attackInterval) || 0;
  return {
    dps: interval > 0 ? Number(averageDamage || 0) * speedFactor / interval : 0,
    effectiveAttackSpeed,
    speedFactor,
    interval,
    provisional: true,
  };
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
  // statBased is already a display percentage (e.g. 11 = 11%).
  const base = attack * defenseFactor * pct(s.targetTaken) * pct(s.damage) * pct(s.damageAmp) * pct(targetBonus) * pct((Number(s.basicDamage) || 0) + (Number(s.skillDamage) || 0)) * pct(Number(s.statBased) || 0) * pct(s.mastery) * critFactor * rangeFactor * pct(s.finalDamage) * ((Number(s.skillCoefficient) || 0) / 100) * accuracyFactor;
  const dps = calculateDps(base, s, rules);
  return {
    average: base,
    min: base * (min / Math.max(rangeFactor, 0.0001)),
    max: base * (Math.max(min, max) / Math.max(rangeFactor, 0.0001)),
    ...dps,
    attack,
    afterDef,
    effectiveDefPen: defPen,
    defenseFactor,
    statBased: Number(s.statBased) || 0,
    critChance,
    targetBonus,
    capsApplied: { defPen: defPenCap, attackSpeed: dps.effectiveAttackSpeed > 0 ? Number(rules?.caps?.attackSpeed || 1500) / 10 : Number(rules?.caps?.attackSpeed || 1500) / 10 },
  };
}

const permille = value => (Number(value) || 0) * 10;
const powerFactor = value => 1 + (Number(value) || 0) / 1000000;

/**
 * Official battle-power calculation.
 * Inputs use the same display units as the calculator UI. Optional fields that
 * are not present are treated as zero, while maxDamage/minDamage use their
 * visible percentage values and critDamage includes the official 30% baseline.
 */
export function calculateCombatPower(s = {}, rules = {}) {
  const attack = (Number(s.attackFlat) || 0) * pct(s.attackPct);
  const maxHp = Number(s.maxHp) || 0;
  const defense = Number(s.playerDefense ?? s.defense) || 0;
  const maxMp = Number(s.maxMp ?? 500) || 0;
  const damage = permille(s.damage);
  const attackSpeed = permille(s.attackSpeed);
  const critRate = permille(s.critRate);
  const critDamage = 300 + permille(s.critDamage);
  const maxDamage = permille(s.maxDamage);
  const minDamage = permille(s.minDamage);
  const accuracy = permille(s.accuracy);
  const evasion = permille(s.evasion);
  const normalDamage = permille(s.normalDamage);
  const bossDamage = permille(s.bossDamage);
  const statusDamage = permille(s.statusDamage);
  const skillDamage = permille(s.skillDamage);
  const basicDamage = permille(s.basicDamage);
  const defPen = permille(s.defPen);
  const buffDuration = permille(s.buffDuration);
  const companionSummonDuration = permille(s.companionSummonDuration);
  const fixedCooldownReductionSeconds = Number(s.fixedCooldownReductionSeconds) || 0;
  const cooldownReductionPercent = permille(s.cooldownReductionPercent);
  const basicAttackTargetCountIncrease = Number(s.basicAttackTargetCountIncrease) || 0;
  const receivedDamageReduction = permille(s.receivedDamageReduction);
  const statBasedDamage = permille(s.statBased);
  const finalDamage = permille(s.finalDamage);
  const damageAmplification = permille(s.damageAmp);
  const skillLevels = s.skillLevels || {};
  const masteries = s.masteries || {};

  const base = attack * 3 + maxHp * 0.05 + defense * 0.2;
  let power = base;
  const factors = [];
  const apply = (name, raw) => {
    const factor = powerFactor(raw);
    power *= factor;
    factors.push({ name, raw, factor });
  };

  apply('hp-defense-mp', maxHp + defense * 20 + (maxMp - 500) * 10);
  apply('damage', damage * 700);
  apply('attack-speed', attackSpeed * 700);
  apply('critical', critRate * 350 + (critDamage - 300) * 550);
  apply('min-max-damage', (maxDamage - 1000) * 350 + (minDamage - 650) * 350);
  apply('accuracy-evasion', accuracy * 4500 + evasion * 1000);
  apply('monster-damage', normalDamage * 350 + bossDamage * 350);
  apply('status-damage', statusDamage * 350);
  apply('skill-basic-damage', skillDamage * 200 + basicDamage * 500);
  apply('defense-penetration', defPen * 1000);
  apply('skill-levels', (Number(skillLevels.first) || 0) * 500 + (Number(skillLevels.second) || 0) * 1000 + (Number(skillLevels.third) || 0) * 2500 + (Number(skillLevels.fourth) || 0) * 3500 + (Number(skillLevels.all) || 0) * 6000);
  apply('buff-duration', buffDuration * 250);
  apply('companion-summon-duration', companionSummonDuration * 250);
  apply('cooldown-reduction', fixedCooldownReductionSeconds * 25 + cooldownReductionPercent * 250);
  apply('target-count', basicAttackTargetCountIncrease * 30000);
  apply('received-damage-reduction', receivedDamageReduction * 200);
  apply('stat-based-damage', statBasedDamage * 700);
  apply('final-damage', finalDamage * 700);
  apply('damage-amplification', damageAmplification * 700);

  const masteryMain = Number(masteries.main80k) || 0;
  const masterySub = Number(masteries.sub25k) || 0;
  apply('mastery-main', masteryMain * 80000);
  apply('mastery-sub', masterySub * 25000);

  const missingInputs = ['maxHp', 'playerDefense', 'evasion', 'statusDamage', 'buffDuration', 'companionSummonDuration', 'fixedCooldownReductionSeconds', 'cooldownReductionPercent', 'basicAttackTargetCountIncrease'].filter(key => s[key] == null);
  return {
    power: Math.max(0, power),
    base,
    factors,
    missingInputs,
    formula: rules?.battlePower?.base || 'official battle-power formula',
    provisional: missingInputs.length > 0,
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
