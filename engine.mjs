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
  * Official fixed/percent cooldown reduction rule:
  * 1. Percent reduction applies first (capped at 100%).
  * 2. Fixed reduction applies at 0.5s per second under 7s remaining, else 1s per second.
  * 3. Final cooldown cannot drop below 4 seconds.
  */
 export function calculateEffectiveCooldown(baseCooldown = 0, cooldownPercent = 0, fixedCdrSeconds = 0) {
   const base = Math.max(0, Number(baseCooldown) || 0);
   if (!base) return 0;
   const pctCDR = clamp(Number(cooldownPercent) || 0, 0, 100);
   const t1 = base * (1 - pctCDR / 100);
   const fixedRate = t1 < 7 ? 0.5 : 1.0;
   const effectiveFixed = (Number(fixedCdrSeconds) || 0) * fixedRate;
   return Math.max(4, t1 - effectiveFixed);
 }
 
 export function calculateMultiTargetDps(singleTargetDps = 0, targetCountIncrease = 0) {
   const dps = Math.max(0, Number(singleTargetDps) || 0);
   const extraTargets = Math.max(0, Number(targetCountIncrease) || 0);
   const targetFactor = 1 + extraTargets;
   return {
     singleTargetDps: dps,
     multiTargetDps: dps * targetFactor,
     targetFactor,
   };
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
   const singleDps = interval > 0 ? Number(averageDamage || 0) * speedFactor / interval : 0;
   const multiTarget = calculateMultiTargetDps(singleDps, s.basicAttackTargetCountIncrease);
   const effectiveCooldown = s.baseCooldown ? calculateEffectiveCooldown(s.baseCooldown, s.cooldownReductionPercent, s.fixedCooldownReductionSeconds) : null;
   return {
     dps: singleDps,
     effectiveAttackSpeed,
     speedFactor,
     interval,
     multiTargetDps: multiTarget.multiTargetDps,
     targetFactor: multiTarget.targetFactor,
     effectiveCooldown,
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

const PVP_CONTENT_KEYS = { arena: 'arena', worldArena: 'worldArena', colosseum: 'colosseum' };

function pvpLevelAdjustment(level, content = 'arena') {
  const value = Math.max(1, Math.floor(Number(level) || 1));
  const brackets = content === 'colosseum'
    ? [[31, 60, 0.005], [61, 70, 0.013], [71, 100, 0.015], [101, Infinity, 0.025]]
    : [[31, 60, 0.005], [61, 100, 0.013], [101, Infinity, 0.015]];
  let multiplier = 1;
  for (const [from, to, penalty] of brackets) {
    const count = Math.max(0, Math.min(value, to) - from + 1);
    if (count > 0) multiplier *= Math.pow(1 - penalty, count);
  }
  return multiplier;
}

/**
 * PvP damage from the official arena/world-arena/colosseum rules.
 * The target's max HP, defense, and received-damage reduction are supplied in
 * targetMaxHp/targetDefense/targetReceivedDamageReduction.
 */
export function calculatePvpDamage(s, rules = {}) {
  const content = PVP_CONTENT_KEYS[s.pvpContent] || 'arena';
  const attack = (Number(s.attackFlat) || 0) * pct(s.attackPct);
  const targetDefense = Math.max(0, Number(s.targetDefense) || 0);
  const targetMaxHp = Math.max(1, Number(s.targetMaxHp ?? s.targetHp) || 1);
  const targetCritResist = Math.max(0, Number(s.targetCritResist) || 0);
  const defPenCap = Number(rules?.caps?.defensePenetration || 1000) / 10;
  const effectiveDefPen = diminishingSum(s.defPen, s.defPenAdditions, defPenCap);
  const afterDef = targetDefense * (1 - effectiveDefPen / 100);
  const defenseFactor = targetDefense > 0 ? 5000 / (afterDef + 6000) : 1;
  const targetReduction = clamp(Number(s.targetReceivedDamageReduction) || 0, 0, 95);
  const basicAndSkill = ((Number(s.basicDamage) || 0) + (Number(s.skillDamage) || 0)) / 2;
  const rawCritRate = Math.max(0, Number(s.critRate) || 0);
  const effectiveCritRate = clamp(rawCritRate - targetCritResist, 0, 100);
  const critChance = clamp(effectiveCritRate / 100, 0, 1);
  const critFactor = 1 + critChance * ((Number(s.critDamage) || 0) / 100);
  const min = Number(s.minDamage) > 0 ? Number(s.minDamage) / 100 : 1;
  const max = Number(s.maxDamage) > 0 ? Number(s.maxDamage) / 100 : 1;
  const rangeFactor = (min + Math.max(min, max)) / 2;
  const accuracyFactor = clamp((Number(s.accuracy) || 0) / 100, 0, 1);
  const generalBase = attack * defenseFactor * pct(s.targetTaken) * (1 - targetReduction / 100) * pct(s.damage) * pct(s.damageAmp) * pct(basicAndSkill) * pct(Number(s.statBased) || 0) * pct(s.mastery) * critFactor * rangeFactor * pct(s.finalDamage) * accuracyFactor;
  const baseWithoutSkill = Math.max(0, generalBase);

  const damage = permille(s.damage);
  const damageAmp = permille(s.damageAmp);
  const basicSkillPermille = permille(basicAndSkill);
  const statBased = permille(s.statBased);
  const critDamage = 300 + permille(s.critDamage);
  const critRate = Math.min(1000, permille(effectiveCritRate));
  const minMaxAverage = (permille(s.minDamage) + permille(s.maxDamage)) / 2;
  const finalDamage = permille(s.finalDamage);
  const pvpCore = attack * Math.max(0, effectiveDefPen * 10) * Math.max(0, damage) * Math.max(0, damageAmp) * Math.max(0, basicSkillPermille / 2) * Math.max(0, statBased) * Math.max(0, critDamage * critRate / 1000) * Math.max(0, minMaxAverage) * Math.max(0, finalDamage) + 1000000000;
  const constant = Number(rules?.pvp?.constants?.[content] || 7206000000);
  const denominator = Math.pow(pvpCore, 0.23)
    * Math.pow(targetMaxHp * 100000000, 0.12)
    * Math.pow((targetDefense + 6000) * 1000000000000, 0.14)
    * Math.pow((1000 + permille(targetReduction)) * 1000000, 0.5)
    / 10000000;
  const pvpDamageAdjustment = denominator > 0 ? constant / denominator / 1000000 : 0;
  const levelAdjustment = pvpLevelAdjustment(s.level, content);
  const skillCoefficient = (Number(s.skillCoefficient) || 0) / 100;
  const average = Math.sqrt(baseWithoutSkill) * skillCoefficient * levelAdjustment * pvpDamageAdjustment * 2;
  const dps = calculateDps(average, s, rules);
  return {
    average,
    min: average * (min / Math.max(rangeFactor, 0.0001)),
    max: average * (Math.max(min, max) / Math.max(rangeFactor, 0.0001)),
    ...dps,
    attack,
    afterDef,
    effectiveDefPen,
    defenseFactor,
    levelAdjustment,
    pvpDamageAdjustment,
    content,
    targetReduction,
    targetMaxHp,
    targetCritResist,
    effectiveCritRate,
    pvpCore,
    pvpDenominator: denominator,
    provisional: false,
  };
}

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

export function cubeTargetSummary(slotOptions = [], goals = [], mode = 'any', cost = 0, currentOptions = null) {
  const targetGoals = [...new Set((goals || []).filter(Boolean))];
  const slots = (slotOptions || []).map(options => {
    const probabilities = {};
    for (const item of options || []) probabilities[item.option] = clamp((Number(item.settingPercent) || 0) / 100, 0, 1);
    return probabilities;
  });
  if (!targetGoals.length || !slots.length) {
    return {
      goals: targetGoals,
      mode,
      probability: 0,
      rawProbability: 0,
      expectedAttempts: Infinity,
      expectedCost: null,
      slotProbabilities: [],
      rerollExclusion: { sameProbability: 0, currentIsGoal: false, rerollAdjusted: false }
    };
  }

  let rawProbability;
  if (mode === 'all') {
    let states = new Map([[0, 1]]);
    for (const slot of slots) {
      const next = new Map();
      const targetProbability = targetGoals.reduce((sum, goal) => sum + (slot[goal] || 0), 0);
      const outcomes = [[0, Math.max(0, 1 - targetProbability)]];
      targetGoals.forEach((goal, index) => outcomes.push([1 << index, slot[goal] || 0]));
      for (const [mask, stateProbability] of states) {
        for (const [outcomeMask, outcomeProbability] of outcomes) {
          if (!outcomeProbability) continue;
          const nextMask = mask | outcomeMask;
          next.set(nextMask, (next.get(nextMask) || 0) + stateProbability * outcomeProbability);
        }
      }
      states = next;
    }
    rawProbability = states.get((1 << targetGoals.length) - 1) || 0;
  } else {
    rawProbability = 1 - slots.reduce((miss, slot) => miss * (1 - targetGoals.reduce((sum, goal) => sum + (slot[goal] || 0), 0)), 1);
  }

  let sameProbability = 0;
  let currentIsGoal = false;
  let rerollAdjusted = false;

  if (Array.isArray(currentOptions) && currentOptions.length === slots.length && currentOptions.every(Boolean)) {
    let matchProd = 1;
    let validMatch = true;
    for (let i = 0; i < slots.length; i++) {
      const opt = currentOptions[i];
      if (slots[i] && typeof slots[i][opt] != null && slots[i][opt] !== undefined) {
        matchProd *= slots[i][opt];
      } else {
        validMatch = false;
        break;
      }
    }
    if (validMatch) {
      sameProbability = matchProd;
      if (mode === 'all') {
        let mask = 0;
        currentOptions.forEach(opt => {
          const idx = targetGoals.indexOf(opt);
          if (idx >= 0) mask |= (1 << idx);
        });
        currentIsGoal = mask === ((1 << targetGoals.length) - 1);
      } else {
        currentIsGoal = currentOptions.some(opt => targetGoals.includes(opt));
      }
      rerollAdjusted = sameProbability > 0;
    }
  }

  let probability = rawProbability;
  if (rerollAdjusted && sameProbability < 1) {
    if (currentIsGoal) {
      probability = Math.max(0, (rawProbability - sameProbability) / (1 - sameProbability));
    } else {
      probability = Math.min(1, rawProbability / (1 - sameProbability));
    }
  }

  const expectedAttempts = probability > 0 ? 1 / probability : Infinity;
  return {
    goals: targetGoals,
    mode,
    probability,
    rawProbability,
    expectedAttempts,
    expectedCost: cost ? expectedAttempts * Number(cost) : null,
    slotProbabilities: slots.map(slot => targetGoals.reduce((sum, goal) => sum + (slot[goal] || 0), 0)),
    rerollExclusion: {
      sameProbability,
      currentIsGoal,
      rerollAdjusted
    }
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
