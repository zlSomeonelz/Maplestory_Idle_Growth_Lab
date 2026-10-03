/**
 * Resource-Constrained Spec-Up & Enhancement Optimization Engine (메이플 키우기 재화 최적화 엔진)
 *
 * Implements:
 * 1. Star Force Markov Chain / DP Absorbing State Expected Cost & Attempts (0성 ~ 30성)
 * 2. Scroll Enhancement Expected Cost with Clean Slate slot recovery
 * 3. Cube/Potential Target Expected Cost & Non-linear Stat Gain
 * 4. Resource Allocation Portfolio Optimizer: Greedy dynamic frontier maximizing DPS per Meso.
 */

import { calculateDamage, calculateCombatPower, clamp } from './engine.mjs';

export const STARFORCE_MAX = 30;

/**
 * Returns the 1-attempt meso cost for star k on item level.
 */
export function getStarforceAttemptCost(k, itemLevel = 120, customCosts = null) {
  if (Array.isArray(customCosts) && customCosts[k] !== undefined && Number(customCosts[k]) > 0) {
    return Number(customCosts[k]);
  }
  const lv = Math.max(10, Number(itemLevel) || 120);
  const star = Math.max(0, Math.floor(Number(k) || 0));
  if (star < 10) {
    return Math.round((1000 + (Math.pow(lv, 3) * (star + 1)) / 40) / 100) * 100;
  } else if (star < 15) {
    return Math.round((1000 + (Math.pow(lv, 3) * Math.pow(star + 1, 2.7)) / 400) / 1000) * 1000;
  } else {
    return Math.round((1000 + (Math.pow(lv, 3) * Math.pow(star + 1, 2.7)) / 200) / 10000) * 10000;
  }
}

/**
 * Calculates stat gain for moving from star k to k+1.
 */
export function getStarforceStatGain(k, slotType = 'weapon', rules = null) {
  const gains = rules?.statGains?.[slotType] || rules?.statGains?.armor || {
    '1-15': { attackFlat: slotType === 'weapon' ? 3 : (slotType === 'glove' ? 1 : 0), mainStat: 2, subStat: 1 },
    '16-20': { attackFlat: slotType === 'weapon' ? 8 : (slotType === 'glove' ? 6 : 4), mainStat: 6, subStat: 3 },
    '21-25': { attackFlat: slotType === 'weapon' ? 12 : (slotType === 'glove' ? 9 : 7), mainStat: 9, subStat: 4 },
    '26-30': { attackFlat: slotType === 'weapon' ? 16 : (slotType === 'glove' ? 12 : 10), mainStat: 13, subStat: 6 }
  };
  const targetStar = k + 1;
  const tierKey = targetStar <= 15 ? '1-15' : targetStar <= 20 ? '16-20' : targetStar <= 25 ? '21-25' : '26-30';
  return gains[tierKey] || { attackFlat: 1, mainStat: 2 };
}

/**
 * Solves the Absorbing Markov Chain for Star Force from fromStar to toStar.
 *
 * Recurrence for reaching k+1 from k:
 * E_k = [ C_k + P_down * E_{k-1} + P_dest * (RecoveryCost + sum_{j=0}^{k-1} E_j) ] / P_succ
 */
export function calculateStarforcePath(fromStar = 0, toStar = 10, options = {}) {
  const from = clamp(Number(fromStar) || 0, 0, STARFORCE_MAX);
  const to = clamp(Number(toStar) || 0, from, STARFORCE_MAX);
  const itemLevel = Number(options.itemLevel) || 120;
  const slotType = options.slotType || 'weapon';
  const probLevels = options.probabilities?.levels || {};
  const rules = options.rules || {};
  const customCosts = options.customCosts || null;

  // Single-step expected metrics arrays: E[k] is cost to go from k to k+1
  const E = new Array(STARFORCE_MAX).fill(0);
  const Attempts = new Array(STARFORCE_MAX).fill(0);
  const Destroys = new Array(STARFORCE_MAX).fill(0);

  // Cumulative cost from 0 to k: cumE[k] = sum_{j=0}^{k-1} E[j]
  const cumE = new Array(STARFORCE_MAX + 1).fill(0);
  const cumAtt = new Array(STARFORCE_MAX + 1).fill(0);
  const cumDest = new Array(STARFORCE_MAX + 1).fill(0);

  for (let k = 0; k < STARFORCE_MAX; k++) {
    const costK = getStarforceAttemptCost(k, itemLevel, customCosts);
    const lvlData = probLevels[String(k)] || {};
    const outcomes = lvlData.outcomes || [{ result: 'success', settingPercent: 100 }];

    let pSucc = 0, pStay = 0, pDown = 0, pDest = 0;
    for (const o of outcomes) {
      const pct = (Number(o.settingPercent) || 0) / 100;
      if (o.result === 'success') pSucc += pct;
      else if (o.result === 'stay') pStay += pct;
      else if (o.result === 'downgrade') pDown += pct;
      else if (o.result === 'destroy') pDest += pct;
    }
    pSucc = Math.max(0.0001, pSucc); // prevent division by zero

    // Recovery fee upon destruction (item reset to 0 in Maple Idle with recovery fee)
    const recovFee = (Number(rules.recoveryCostMultiplier) || 2.5) * costK;

    const prevE = k > 0 ? E[k - 1] : 0;
    const prevAtt = k > 0 ? Attempts[k - 1] : 0;
    const prevDest = k > 0 ? Destroys[k - 1] : 0;

    // Expected meso to cross star k -> k+1
    E[k] = (costK + pDown * prevE + pDest * (recovFee + cumE[k])) / pSucc;

    // Expected attempts to cross star k -> k+1
    Attempts[k] = (1 + pDown * prevAtt + pDest * (cumAtt[k])) / pSucc;

    // Expected destroys to cross star k -> k+1
    Destroys[k] = (pDest * (1 + cumDest[k]) + pDown * prevDest) / pSucc;

    cumE[k + 1] = cumE[k] + E[k];
    cumAtt[k + 1] = cumAtt[k] + Attempts[k];
    cumDest[k + 1] = cumDest[k] + Destroys[k];
  }

  // Sum from fromStar to toStar
  let totalCost = 0;
  let totalAttempts = 0;
  let totalDestroys = 0;
  const statGains = {};
  const steps = [];

  for (let k = from; k < to; k++) {
    totalCost += E[k];
    totalAttempts += Attempts[k];
    totalDestroys += Destroys[k];

    const stepGain = getStarforceStatGain(k, slotType, rules);
    for (const [sKey, sVal] of Object.entries(stepGain)) {
      statGains[sKey] = (statGains[sKey] || 0) + Number(sVal || 0);
    }

    steps.push({
      star: k,
      nextStar: k + 1,
      expectedCost: E[k],
      expectedAttempts: Attempts[k],
      expectedDestroys: Destroys[k],
      statGain: stepGain
    });
  }

  return {
    fromStar: from,
    toStar: to,
    totalCost,
    totalAttempts,
    totalDestroys,
    statGains,
    steps
  };
}

/**
 * Calculates expected cost to achieve target successful scroll upgrades.
 */
export function calculateScrollEnhancement(slotsTotal = 8, targetSuccesses = 8, scrollTypeKey = 'scroll70', options = {}) {
  const rules = options.rules?.scrolls || {};
  const scrollDef = rules.types?.[scrollTypeKey] || {
    name: '70% 주문서',
    successRate: 0.7,
    weaponStat: { attackFlat: 3, mainStat: 2 },
    armorStat: { mainStat: 3, subStat: 1 },
    costMeso: 300000
  };
  const cleanSlateDef = rules.cleanSlate || {
    name: '순백의 주문서 10%',
    successRate: 0.1,
    costMeso: 1500000
  };

  const M = Math.max(1, Math.min(slotsTotal, targetSuccesses));
  const p = Math.max(0.01, scrollDef.successRate);
  const pClean = Math.max(0.01, cleanSlateDef.successRate);

  const scrollCost = Number(scrollDef.costMeso) || 300000;
  const cleanSlateCost = Number(cleanSlateDef.costMeso) || 1500000;

  // Expected scroll attempts to get M successes
  const expectedScrolls = M / p;
  // Expected failed attempts that need clean slate recovery
  const expectedFails = M * ((1 - p) / p);
  // Expected clean slates needed to recover those failed slots
  const expectedCleanSlates = expectedFails / pClean;

  const totalCost = (expectedScrolls * scrollCost) + (expectedCleanSlates * cleanSlateCost);

  const statProfile = options.slotType === 'weapon' ? (scrollDef.weaponStat || {}) : (scrollDef.armorStat || {});
  const statGains = {};
  for (const [k, v] of Object.entries(statProfile)) {
    statGains[k] = (Number(v) || 0) * M;
  }

  return {
    slotsTarget: M,
    scrollName: scrollDef.name,
    successRate: p,
    expectedScrolls,
    expectedCleanSlates,
    totalCost,
    statGains
  };
}

/**
 * Helper to apply delta stats onto player inputs.
 */
export function applyStatGains(baseInputs, statGains = {}) {
  const out = { ...baseInputs };
  for (const [k, v] of Object.entries(statGains || {})) {
    const val = Number(v) || 0;
    if (!val) continue;
    if (k === 'attackFlat') out.attackFlat = (Number(out.attackFlat) || 0) + val;
    else if (k === 'attackPct') out.attackPct = (Number(out.attackPct) || 0) + val;
    else if (k === 'mainStat') out.mainStat = (Number(out.mainStat) || 0) + val;
    else if (k === 'mainStatPct') out.mainStatPct = (Number(out.mainStatPct) || 0) + val;
    else if (k === 'subStat') out.subStat = (Number(out.subStat) || 0) + val;
    else if (k === 'damage') out.damage = (Number(out.damage) || 0) + val;
    else if (k === 'damageAmp') out.damageAmp = (Number(out.damageAmp) || 0) + val;
    else if (k === 'finalDamage') out.finalDamage = (Number(out.finalDamage) || 0) + val;
    else if (k === 'bossDamage') out.bossDamage = (Number(out.bossDamage) || 0) + val;
    else if (k === 'normalDamage') out.normalDamage = (Number(out.normalDamage) || 0) + val;
    else if (k === 'critRate') out.critRate = (Number(out.critRate) || 0) + val;
    else if (k === 'critDamage') out.critDamage = (Number(out.critDamage) || 0) + val;
    else if (k === 'defPen') out.defPen = (Number(out.defPen) || 0) + val;
    else if (k === 'maxHp') out.maxHp = (Number(out.maxHp) || 0) + val;
    else if (k === 'playerDefense') out.playerDefense = (Number(out.playerDefense) || 0) + val;
  }
  out.statBased = (Number(out.mainStat) || 0) / 100 + (Number(out.subStat) || 0) / 400;
  return out;
}

export function subtractStatGains(baseInputs, statGains = {}) {
  const out = { ...baseInputs };
  for (const [k, v] of Object.entries(statGains || {})) {
    const val = Number(v) || 0;
    if (!val) continue;
    if (k === 'attackFlat') out.attackFlat = Math.max(0, (Number(out.attackFlat) || 0) - val);
    else if (k === 'attackPct') out.attackPct = Math.max(0, (Number(out.attackPct) || 0) - val);
    else if (k === 'mainStat') out.mainStat = Math.max(0, (Number(out.mainStat) || 0) - val);
    else if (k === 'mainStatPct') out.mainStatPct = Math.max(0, (Number(out.mainStatPct) || 0) - val);
    else if (k === 'subStat') out.subStat = Math.max(0, (Number(out.subStat) || 0) - val);
    else if (k === 'damage') out.damage = Math.max(0, (Number(out.damage) || 0) - val);
    else if (k === 'damageAmp') out.damageAmp = Math.max(0, (Number(out.damageAmp) || 0) - val);
    else if (k === 'finalDamage') out.finalDamage = Math.max(0, (Number(out.finalDamage) || 0) - val);
    else if (k === 'bossDamage') out.bossDamage = Math.max(0, (Number(out.bossDamage) || 0) - val);
    else if (k === 'normalDamage') out.normalDamage = Math.max(0, (Number(out.normalDamage) || 0) - val);
    else if (k === 'critRate') out.critRate = Math.max(0, (Number(out.critRate) || 0) - val);
    else if (k === 'critDamage') out.critDamage = Math.max(0, (Number(out.critDamage) || 0) - val);
    else if (k === 'defPen') out.defPen = Math.max(0, (Number(out.defPen) || 0) - val);
    else if (k === 'maxHp') out.maxHp = Math.max(0, (Number(out.maxHp) || 0) - val);
    else if (k === 'playerDefense') out.playerDefense = Math.max(0, (Number(out.playerDefense) || 0) - val);
  }
  out.statBased = (Number(out.mainStat) || 0) / 100 + (Number(out.subStat) || 0) / 400;
  return out;
}

export function getCubeStatProfile(slotType = 'armor', grade = 'epic', validLines = 1) {
  const lines = Math.max(0, Math.min(3, Number(validLines) || 0));
  if (lines === 0) return {};

  if (slotType === 'glove') {
    if (grade === 'rare') return lines >= 2 ? { critRate: 4 } : { critRate: 2 };
    if (grade === 'epic') return lines >= 2 ? { critDamage: 2, mainStatPct: 6 } : { critDamage: 2 };
    if (grade === 'unique') return lines >= 2 ? { critDamage: 4, mainStatPct: 6 } : { critDamage: 4 };
    return lines >= 2 ? { critDamage: 8, attackPct: 6 } : { critDamage: 8 };
  }

  if (slotType === 'weapon') {
    if (grade === 'rare') return lines >= 2 ? { attackPct: 3, mainStatPct: 3 } : { attackPct: 3 };
    if (grade === 'epic') return lines >= 2 ? { attackPct: 6, bossDamage: 6 } : { attackPct: 6 };
    if (grade === 'unique') return lines >= 2 ? { attackPct: 9, bossDamage: 12 } : { attackPct: 9 };
    return lines >= 2 ? { bossDamage: 24, attackPct: 9 } : { bossDamage: 12, attackPct: 9 };
  }

  // armor or accessory
  if (grade === 'rare') return lines >= 2 ? { mainStatPct: 6 } : { mainStatPct: 3 };
  if (grade === 'epic') return lines >= 2 ? { mainStatPct: 12 } : { mainStatPct: 6 };
  if (grade === 'unique') return lines >= 2 ? { mainStatPct: 15 } : { mainStatPct: 9 };
  return lines >= 2 ? { mainStatPct: 21 } : { mainStatPct: 12 };
}

/**
 * Dynamic Portfolio Spec-Up Optimizer (자원 한계 내 스펙업 최적화기)
 *
 * Evaluates candidate enhancements across Star Force, Scrolls, and Potential Cubes.
 * Uses exact calculateDamage(currentStats + delta) to account for dynamic bucket saturation.
 */
function getEffectiveDPS(res) {
  if (!res) return 1;
  const dps = Number(res.dps);
  if (dps > 0) return dps;
  const avg = Number(res.average);
  if (avg > 0) return avg;
  return 1;
}

export function optimizeSpecUpPath({
  budgetMeso = 100000000,
  playerInputs = {},
  equipmentList = [],
  enhancementRules = {},
  starforceProbabilities = {},
  potentialProbabilities = {},
  combatRules = {},
  maxSteps = 30
}) {
  let budgetRemaining = Math.max(0, Number(budgetMeso) || 0);
  let currentStats = {
    accuracy: 100,
    skillCoefficient: 100,
    target: 'boss',
    ...playerInputs
  };

  const initialDpsRes = calculateDamage(currentStats, combatRules);
  const initialPowerRes = calculateCombatPower(currentStats, combatRules);
  const initialDps = getEffectiveDPS(initialDpsRes);
  const initialPower = Number(initialPowerRes.power) || 1;

  // Clone equipment list to mutate state across steps
  const equips = equipmentList.map(eq => ({
    id: eq.id || eq.name,
    name: eq.name,
    slotType: eq.slotType || 'weapon', // 'weapon', 'glove', 'armor', 'accessory'
    itemLevel: Number(eq.itemLevel) || 120,
    currentStar: Math.min(STARFORCE_MAX, Math.max(0, Number(eq.currentStar) || 0)),
    maxStar: Math.min(STARFORCE_MAX, Number(eq.maxStar) || 20),
    scrollSlotsTotal: Number(eq.scrollSlotsTotal) || 8,
    scrollSlotsUsed: Number(eq.scrollSlotsUsed) || 0,
    cubeGrade: eq.cubeGrade || 'epic', // 'rare', 'epic', 'unique', 'legendary'
    cubeValidLines: Math.min(3, Math.max(0, Number(eq.cubeValidLines !== undefined ? eq.cubeValidLines : 1)))
  }));

  const steps = [];
  let currentDps = initialDps;
  let currentPower = initialPower;

  for (let step = 1; step <= maxSteps; step++) {
    if (budgetRemaining <= 0) break;

    const candidates = [];

    // 1. Star Force Candidates (+1 star step)
    for (const eq of equips) {
      if (eq.currentStar < eq.maxStar) {
        const nextStar = eq.currentStar + 1;
        const sfRes = calculateStarforcePath(eq.currentStar, nextStar, {
          itemLevel: eq.itemLevel,
          slotType: eq.slotType,
          probabilities: starforceProbabilities,
          rules: enhancementRules.starforce
        });

        if (sfRes.totalCost > 0 && sfRes.totalCost <= budgetRemaining) {
          const testInputs = applyStatGains(currentStats, sfRes.statGains);
          const testDpsRes = calculateDamage(testInputs, combatRules);
          const testDpsVal = getEffectiveDPS(testDpsRes);
          const dpsDelta = Math.max(0, testDpsVal - currentDps);
          const dpsGainPct = (dpsDelta / currentDps) * 100;
          const roi = sfRes.totalCost > 0 ? (dpsGainPct / (sfRes.totalCost / 10000)) : 0; // % per 10k meso

          candidates.push({
            type: 'starforce',
            equipment: eq,
            targetStar: nextStar,
            cost: sfRes.totalCost,
            statGains: sfRes.statGains,
            dpsDelta,
            dpsGainPct,
            roi,
            description: `[${eq.name}] 스타포스 ${eq.currentStar}성 → ${nextStar}성`
          });
        }
      }
    }

    // 2. Scroll Enhancement Candidates (Fill 1 scroll slot)
    for (const eq of equips) {
      const slotsLeft = eq.scrollSlotsTotal - eq.scrollSlotsUsed;
      if (slotsLeft > 0) {
        // Evaluate 70% and 30% scroll choices
        for (const scrollKey of ['scroll70', 'scroll30']) {
          const scRes = calculateScrollEnhancement(1, 1, scrollKey, {
            slotType: eq.slotType,
            rules: enhancementRules
          });

          if (scRes.totalCost > 0 && scRes.totalCost <= budgetRemaining) {
            const testInputs = applyStatGains(currentStats, scRes.statGains);
            const testDpsRes = calculateDamage(testInputs, combatRules);
            const testDpsVal = getEffectiveDPS(testDpsRes);
            const dpsDelta = Math.max(0, testDpsVal - currentDps);
            const dpsGainPct = (dpsDelta / currentDps) * 100;
            const roi = scRes.totalCost > 0 ? (dpsGainPct / (scRes.totalCost / 10000)) : 0;

            candidates.push({
              type: 'scroll',
              equipment: eq,
              scrollKey,
              cost: scRes.totalCost,
              statGains: scRes.statGains,
              dpsDelta,
              dpsGainPct,
              roi,
              description: `[${eq.name}] ${scRes.scrollName} 작 (남은 ${slotsLeft}슬롯 중 1슬롯)`
            });
          }
        }
      }
    }

    // 3. Cube Potential Candidates (Reroll for valid lines or Tier up)
    for (const eq of equips) {
      const currentLines = eq.cubeValidLines;
      const currentGrade = eq.cubeGrade;
      const currentCubeStats = getCubeStatProfile(eq.slotType, currentGrade, currentLines);
      const cubeCost = enhancementRules.cubeCosts?.[currentGrade] || 200000;

      // 3A. Reroll at current grade to gain +1 valid line (if lines < 2)
      if (currentLines < 2) {
        const targetLines = currentLines + 1;
        const targetStats = getCubeStatProfile(eq.slotType, currentGrade, targetLines);
        const expectedTries = targetLines === 1 ? 8 : 26;
        const totalCubeCost = expectedTries * cubeCost;

        if (totalCubeCost <= budgetRemaining) {
          const statsWithoutOld = subtractStatGains(currentStats, currentCubeStats);
          const testInputs = applyStatGains(statsWithoutOld, targetStats);
          const testDpsRes = calculateDamage(testInputs, combatRules);
          const testDpsVal = getEffectiveDPS(testDpsRes);
          const dpsDelta = Math.max(0, testDpsVal - currentDps);
          const dpsGainPct = (dpsDelta / currentDps) * 100;
          const roi = totalCubeCost > 0 ? (dpsGainPct / (totalCubeCost / 10000)) : 0;

          if (dpsGainPct > 0) {
            candidates.push({
              type: 'cube',
              equipment: eq,
              targetGrade: currentGrade,
              targetValidLines: targetLines,
              cost: totalCubeCost,
              oldCubeStats: currentCubeStats,
              newCubeStats: targetStats,
              statGains: targetStats,
              dpsDelta,
              dpsGainPct,
              roi,
              description: `[${eq.name}] 큐브 재설정 (${currentGrade} ${currentLines}줄 → ${targetLines}줄 유효)`
            });
          }
        }
      }

      // 3B. Tier-up to next grade
      if (currentGrade !== 'legendary') {
        const nextGrade = currentGrade === 'rare' ? 'epic' : currentGrade === 'epic' ? 'unique' : 'legendary';
        const expectedTries = nextGrade === 'epic' ? 20 : nextGrade === 'unique' ? 45 : 100;
        const totalCubeCost = expectedTries * cubeCost;

        if (totalCubeCost <= budgetRemaining) {
          const targetLines = Math.max(1, currentLines);
          const targetStats = getCubeStatProfile(eq.slotType, nextGrade, targetLines);

          const statsWithoutOld = subtractStatGains(currentStats, currentCubeStats);
          const testInputs = applyStatGains(statsWithoutOld, targetStats);
          const testDpsRes = calculateDamage(testInputs, combatRules);
          const testDpsVal = getEffectiveDPS(testDpsRes);
          const dpsDelta = Math.max(0, testDpsVal - currentDps);
          const dpsGainPct = (dpsDelta / currentDps) * 100;
          const roi = totalCubeCost > 0 ? (dpsGainPct / (totalCubeCost / 10000)) : 0;

          if (dpsGainPct > 0) {
            candidates.push({
              type: 'cube',
              equipment: eq,
              targetGrade: nextGrade,
              targetValidLines: targetLines,
              cost: totalCubeCost,
              oldCubeStats: currentCubeStats,
              newCubeStats: targetStats,
              statGains: targetStats,
              dpsDelta,
              dpsGainPct,
              roi,
              description: `[${eq.name}] 큐브 등급업 (${currentGrade} → ${nextGrade}, 유효 ${targetLines}줄)`
            });
          }
        }
      }
    }

    if (!candidates.length) break;

    // Pick candidate with highest ROI (Bang-for-the-buck)
    candidates.sort((a, b) => b.roi - a.roi);
    const chosen = candidates[0];

    budgetRemaining -= chosen.cost;

    if (chosen.type === 'starforce') {
      chosen.equipment.currentStar = chosen.targetStar;
      currentStats = applyStatGains(currentStats, chosen.statGains);
    } else if (chosen.type === 'scroll') {
      chosen.equipment.scrollSlotsUsed += 1;
      currentStats = applyStatGains(currentStats, chosen.statGains);
    } else if (chosen.type === 'cube') {
      chosen.equipment.cubeGrade = chosen.targetGrade;
      chosen.equipment.cubeValidLines = chosen.targetValidLines;
      currentStats = subtractStatGains(currentStats, chosen.oldCubeStats);
      currentStats = applyStatGains(currentStats, chosen.newCubeStats);
    }

    const newDpsRes = calculateDamage(currentStats, combatRules);
    const newPowerRes = calculateCombatPower(currentStats, combatRules);
    currentDps = getEffectiveDPS(newDpsRes);
    currentPower = Number(newPowerRes.power) || 1;

    steps.push({
      stepNumber: step,
      type: chosen.type,
      description: chosen.description,
      cost: chosen.cost,
      dpsDelta: chosen.dpsDelta,
      dpsGainPct: chosen.dpsGainPct,
      roi: chosen.roi,
      newDps: currentDps,
      budgetRemaining,
      statGains: chosen.statGains
    });
  }

  const totalDpsGainPct = initialDps > 0 ? ((currentDps - initialDps) / initialDps) * 100 : 0;
  const totalPowerGainPct = initialPower > 0 ? ((currentPower - initialPower) / initialPower) * 100 : 0;

  return {
    initialDps,
    finalDps: currentDps,
    totalDpsGainPct,
    initialPower,
    finalPower: currentPower,
    totalPowerGainPct,
    budgetTotal: budgetMeso,
    budgetUsed: budgetMeso - budgetRemaining,
    budgetRemaining,
    steps
  };
}
