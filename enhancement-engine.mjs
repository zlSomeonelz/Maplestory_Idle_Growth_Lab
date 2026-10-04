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

export function getEquipmentCubeStats(equip = {}) {
  if (Array.isArray(equip.potentialLines) && equip.potentialLines.length > 0) {
    const stats = {};
    for (const line of equip.potentialLines) {
      if (!line || !line.stat || line.stat === 'NONE') continue;
      const val = Number(line.value) || 0;
      if (val > 0) {
        stats[line.stat] = (stats[line.stat] || 0) + val;
      }
    }
    return stats;
  }
  const lines = equip.cubeValidLines !== undefined ? Number(equip.cubeValidLines) : 1;
  return getCubeStatProfile(equip.slotType || 'armor', equip.cubeGrade || 'epic', lines);
}

export function getCubeStatProfile(slotType = 'armor', grade = 'epic', validLines = 1) {
  const lines = Math.max(0, Math.min(3, Number(validLines) || 0));
  if (lines === 0) return {};

  const isGloveSlot = slotType === 'glove' || slotType === 'gloves';
  if (isGloveSlot) {
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
 * MekiCalc-Style Single Equipment Cube Evaluator & Action Recommendation.
 * Evaluates current potential lines, computes expected cost to improve, dynamic DPS delta & ROI,
 * and outputs a concrete stop-line verdict ('STOP', 'REROLL', 'TIER_UP', 'KEEP').
 */
export function recommendCubeAction(equip, playerStats = {}, combatRules = {}, enhancementRules = {}) {
  const grade = equip.cubeGrade || 'epic';
  const slotType = equip.slotType || 'armor';
  const currentCubeStats = getEquipmentCubeStats(equip);
  const statsWithoutItem = subtractStatGains(playerStats, currentCubeStats);

  const initialDpsRes = calculateDamage(playerStats, combatRules);
  const currentDps = getEffectiveDPS(initialDpsRes);

  const linesCount = Array.isArray(equip.potentialLines) && equip.potentialLines.length > 0
    ? equip.potentialLines.filter(l => l && l.stat && l.stat !== 'NONE' && Number(l.value) > 0).length
    : (equip.cubeValidLines !== undefined ? Number(equip.cubeValidLines) : 1);

  const costPerTry = enhancementRules?.cubeCosts?.[grade] || (
    grade === 'rare' ? 80000 : grade === 'epic' ? 200000 : grade === 'unique' ? 600000 : 1500000
  );

  // 1. Path A: Reroll at current grade
  let rerollTargetLines = Math.min(2, linesCount + 1);
  if (linesCount >= 2) rerollTargetLines = 3;
  const expectedRerollTries = linesCount === 0 ? 8 : (linesCount === 1 ? 28 : 250);
  const expectedRerollCost = expectedRerollTries * costPerTry;
  const rerollStats = getCubeStatProfile(slotType, grade, rerollTargetLines);
  const rerollTestInputs = applyStatGains(statsWithoutItem, rerollStats);
  const rerollDpsRes = calculateDamage(rerollTestInputs, combatRules);
  const rerollDps = getEffectiveDPS(rerollDpsRes);
  const rerollDpsDelta = Math.max(0, rerollDps - currentDps);
  const rerollGainPct = currentDps > 0 ? (rerollDpsDelta / currentDps) * 100 : 0;
  const rerollRoi = expectedRerollCost > 0 ? (rerollGainPct / (expectedRerollCost / 1000000)) : 0;

  // 2. Path B: Tier-Up (if not legendary)
  let tierUpCost = 0;
  let tierUpGainPct = 0;
  let tierUpRoi = 0;
  let tierUpDpsDelta = 0;
  let nextGrade = grade;
  if (grade !== 'legendary') {
    nextGrade = grade === 'rare' ? 'epic' : grade === 'epic' ? 'unique' : 'legendary';
    const expectedTierUpTries = nextGrade === 'epic' ? 20 : (nextGrade === 'unique' ? 45 : 100);
    tierUpCost = expectedTierUpTries * costPerTry;
    const tierUpStats = getCubeStatProfile(slotType, nextGrade, Math.max(1, linesCount));
    const tierUpTestInputs = applyStatGains(statsWithoutItem, tierUpStats);
    const tierUpDpsRes = calculateDamage(tierUpTestInputs, combatRules);
    const tierUpDps = getEffectiveDPS(tierUpDpsRes);
    tierUpDpsDelta = Math.max(0, tierUpDps - currentDps);
    tierUpGainPct = currentDps > 0 ? (tierUpDpsDelta / currentDps) * 100 : 0;
    tierUpRoi = tierUpCost > 0 ? (tierUpGainPct / (tierUpCost / 1000000)) : 0;
  }

  // Verdict Decision
  let verdict = 'KEEP';
  let verdictLabel = '⏸️ 임시 유지';
  let badgeColor = '#475467';
  let reason = '';
  let chosenTarget = null;

  const hasCritDamage = Number(currentCubeStats.critDamage || 0) >= 2;
  const hasHighAttack = Number(currentCubeStats.attackPct || 0) >= 9 || (Number(currentCubeStats.attackPct || 0) >= 6 && Number(currentCubeStats.bossDamage || 0) >= 6);

  const isGloveSlot = slotType === 'glove' || slotType === 'gloves';
  if (linesCount >= 2 || (isGloveSlot && hasCritDamage && grade !== 'rare') || (slotType === 'weapon' && hasHighAttack && grade !== 'rare')) {
    verdict = 'STOP';
    verdictLabel = '🛑 스톱 (졸업 권장)';
    badgeColor = '#0b7a58';
    reason = '현재 옵션이 2줄 유효 이상이거나 핵심 극옵(크뎀/공보공)을 확보한 가성비 종결 상태입니다. 3줄 극옵 도전은 비용 대비 효율이 급감하므로 즉시 스톱하고 스타포스/주문서에 자원을 투자하세요.';
    chosenTarget = {
      type: 'reroll',
      description: '3줄 극옵 도전 (비권장)',
      cost: expectedRerollCost,
      dpsDelta: rerollDpsDelta,
      dpsGainPct: rerollGainPct,
      roiPerMillion: rerollRoi
    };
  } else if (linesCount === 0) {
    verdict = 'REROLL';
    verdictLabel = '🔄 최우선 리롤';
    badgeColor = '#b42318';
    reason = '현재 유효 옵션이 없는 잡옵 상태입니다. 평균 8회 내외의 적은 비용으로 유효 1줄(공%/크뎀/주스탯)을 확보할 수 있어 100만 메소당 딜 상승 효율(ROI)이 전 부위 중 가장 높습니다.';
    chosenTarget = {
      type: 'reroll',
      description: `${grade} 유효 1줄 확보`,
      cost: expectedRerollCost,
      dpsDelta: rerollDpsDelta,
      dpsGainPct: rerollGainPct,
      roiPerMillion: rerollRoi
    };
  } else if (grade === 'rare' || (isGloveSlot && grade === 'epic')) {
    verdict = 'TIER_UP';
    verdictLabel = '⬆️ 등급업 권장';
    badgeColor = '#7c3aed';
    reason = isGloveSlot
      ? '장갑은 유니크 등급 이상에서 크리티컬 데미지%(핵심 스탯)가 출현합니다. 에픽 1줄에 머무르지 말고 유니크 등급업을 노리세요.'
      : '레어 등급은 잠재능력 수치 상한이 낮습니다. 에픽 등급으로 승급하여 유효 퍼센트 옵션을 확보하세요.';
    chosenTarget = {
      type: 'tier_up',
      description: `${nextGrade} 등급업`,
      cost: tierUpCost,
      dpsDelta: tierUpDpsDelta,
      dpsGainPct: tierUpGainPct,
      roiPerMillion: tierUpRoi
    };
  } else {
    verdict = 'KEEP';
    verdictLabel = '⏸️ 임시 유지';
    badgeColor = '#d97706';
    reason = '유효 1줄을 확보하여 가성비 라인을 달성했습니다. 잡옵(0줄) 부위 리롤이나 스타포스(10~15성)를 먼저 완료한 후 다음 단계로 넘어가세요.';
    const pickTierUp = tierUpRoi > rerollRoi && grade !== 'legendary';
    chosenTarget = pickTierUp ? {
      type: 'tier_up',
      description: `${nextGrade} 등급업`,
      cost: tierUpCost,
      dpsDelta: tierUpDpsDelta,
      dpsGainPct: tierUpGainPct,
      roiPerMillion: tierUpRoi
    } : {
      type: 'reroll',
      description: `${grade} 유효 2줄 도전`,
      cost: expectedRerollCost,
      dpsDelta: rerollDpsDelta,
      dpsGainPct: rerollGainPct,
      roiPerMillion: rerollRoi
    };
  }

  return {
    equipmentId: equip.id,
    equipmentName: equip.name,
    slotType,
    cubeGrade: grade,
    currentLinesCount: linesCount,
    currentStats: currentCubeStats,
    currentDps,
    verdict,
    verdictLabel,
    badgeColor,
    reason,
    target: chosenTarget,
    preferredSettings: getInGamePreferredCubeSettings(slotType, grade, playerStats.job || 'hero')
  };
}

/**
 * Generates exact in-game "선호 옵션 설정" (Auto-Cube Stop Conditions: 3 Presets & Tier-up mode)
 * matching the official Maple Idle in-game UI.
 */
export function getInGamePreferredCubeSettings(slotType = 'weapon', grade = 'epic', jobKey = 'hero', jobStats = null) {
  let mainStat = 'STR';
  if (jobStats?.jobs?.[jobKey]?.main?.[0]) {
    mainStat = jobStats.jobs[jobKey].main[0];
  } else {
    if (['nightLord', 'shadower', 'nightWalker'].includes(jobKey)) mainStat = 'LUK';
    else if (['bowmaster', 'sniper', 'captain', 'windBreaker'].includes(jobKey)) mainStat = 'DEX';
    else if (['archMageIceLightning', 'archMageFirePoison', 'bishop'].includes(jobKey)) mainStat = 'INT';
    else mainStat = 'STR';
  }

  const isWeapon = slotType === 'weapon' || ['weapon', 'subWeapon', 'emblem'].includes(slotType);
  const isGlove = slotType === 'glove' || slotType === 'gloves';
  const isHat = slotType === 'hat' || slotType === '모자' || slotType === '투구';
  const isTierUpNeeded = grade === 'rare' || (isGlove && grade === 'epic');

  const tierUpMode = isTierUpNeeded ? 'ON (권장)' : 'OFF';

  let preset1 = {};
  let preset2 = {};
  let preset3 = {};

  if (isWeapon) {
    preset1 = {
      index: 1,
      title: '조건 ①: 3줄 극옵 대박 즉시 스톱',
      minCount: '3개 이상',
      options: ['공격력%', '보스 몬스터 데미지%', '데미지%', '방어 관통력%', `${mainStat}%`, `${mainStat}(+)`],
      description: '3줄이 모두 유효 옵션으로 떴을 때 즉시 멈추고 보관하는 안전장치입니다.'
    };
    preset2 = {
      index: 2,
      title: '조건 ②: 2줄 유효 가성비 종결 (핵심 권장)',
      minCount: '2개 이상',
      options: ['공격력%', '보스 몬스터 데미지%'],
      description: '공%+공%, 공%+보공%, 보공%+보공% 2줄 유효를 뽑아 실전 가성비를 극대화합니다.'
    };
    preset3 = {
      index: 3,
      title: '조건 ③: 1줄 타협 / 2줄 서브 킵',
      minCount: '2개 이상',
      options: ['공격력%', '보스 몬스터 데미지%', '데미지%', `${mainStat}%`],
      description: '공%/보공 1줄과 데미지/주스탯이 떴을 때 임시로 멈추고 메소 소모를 방지합니다.'
    };
  } else if (isGlove) {
    preset1 = {
      index: 1,
      title: '조건 ①: 3줄 극옵 대박 즉시 스톱',
      minCount: '3개 이상',
      options: ['크리티컬 데미지%', '공격력%', `${mainStat}%`, '데미지%', '크리티컬 확률%', `${mainStat}(+)`],
      description: '크뎀을 포함한 3줄 유효가 떴을 때 즉시 자동 변환을 멈춥니다.'
    };
    preset2 = {
      index: 2,
      title: '조건 ②: 크뎀 포함 2줄 종결 (고스펙 목표)',
      minCount: '2개 이상',
      options: ['크리티컬 데미지%', '공격력%', `${mainStat}%`],
      description: '크뎀 1줄 + 공%/주스탯 1줄로 장갑 잠재능력 최고 가성비를 달성합니다.'
    };
    preset3 = {
      index: 3,
      title: '조건 ③: 크뎀 단독 1줄 스톱 (초가성비 강력 권장)',
      minCount: '1개 이상',
      options: ['크리티컬 데미지%'],
      description: '장갑은 크리티컬 데미지 1줄만으로도 다른 부위 2~3줄 이상의 딜 상승을 보입니다.'
    };
  } else if (isHat) {
    preset1 = {
      index: 1,
      title: '조건 ①: 3줄 극옵 대박 즉시 스톱',
      minCount: '3개 이상',
      options: ['스킬 재사용 대기시간 감소', '데미지%', `${mainStat}%`, '최소 데미지 배율', '최대 데미지 배율', '크리티컬 확률%', '공격 속도%', `${mainStat}(+)`],
      description: '쿨감 및 유효 3줄이 떴을 때 즉시 멈추는 전체 유효 옵션 설정입니다.'
    };
    preset2 = {
      index: 2,
      title: '조건 ②: 2줄 유효 실전 목표 (가성비 권장)',
      minCount: '2개 이상',
      options: ['스킬 재사용 대기시간 감소', '데미지%', `${mainStat}%`, '최대 데미지 배율'],
      description: '모자 핵심 옵션인 쿨감/데미지/주스탯/최대뎀 2줄 유효에서 멈춥니다.'
    };
    preset3 = {
      index: 3,
      title: '조건 ③: 데미지/주스탯 2줄 타협 킵',
      minCount: '2개 이상',
      options: ['데미지%', `${mainStat}%`],
      description: '주스탯/데미지 2줄이 떴을 때 임시로 멈추고 킵합니다.'
    };
  } else {
    // 일반 방어구 및 장신구
    preset1 = {
      index: 1,
      title: '조건 ①: 3줄 극옵 대박 즉시 스톱',
      minCount: '3개 이상',
      options: [`${mainStat}%`, '데미지%', '최소 데미지 배율', '최대 데미지 배율', `${mainStat}(+)`, '방어력%', '최대 HP%'],
      description: '3줄 모두 유효가 떴을 때 즉시 멈추는 안전장치입니다.'
    };
    preset2 = {
      index: 2,
      title: '조건 ②: 주스탯 2줄 준종결 (가성비 권장)',
      minCount: '2개 이상',
      options: [`${mainStat}%`, '데미지%', '최대 데미지 배율'],
      description: '주스탯% 2줄 또는 주스탯%+데미지% 유효 2줄에서 멈춥니다.'
    };
    preset3 = {
      index: 3,
      title: '조건 ③: 주스탯 1줄 타협 스톱 (저자본 킵)',
      minCount: '1개 이상',
      options: [`${mainStat}%`],
      description: '에픽 1줄(6%) 또는 유니크 1줄(9%)을 확보하고 메소 소모를 멈춥니다.'
    };
  }

  return {
    slotType,
    grade,
    mainStat,
    tierUpMode,
    tierUpReason: isTierUpNeeded
      ? (isGlove ? '장갑은 유니크 등급 이상에서 크리티컬 데미지%가 등장하므로 등급업 시 무조건 정지해야 합니다.' : '상위 등급 승급 시 옵션 수치 상한이 크게 올라가므로 등급업 모드를 켜두세요.')
      : '이미 상위 등급이므로 목표 옵션 달성에 집중하여 등급업 모드를 끄는 것을 권장합니다.',
    presets: [preset1, preset2, preset3]
  };
}

/**
 * Evaluates and ranks all equipment slots by cube investment priority (MekiCalc Leaderboard).
 * Highest priority (Reroll with high ROI) -> Tier-Up -> Keep -> Stop.
 */
export function rankAllEquipmentCubes(equipmentList = [], playerStats = {}, combatRules = {}, enhancementRules = {}) {
  const recommendations = equipmentList.map(eq =>
    recommendCubeAction(eq, playerStats, combatRules, enhancementRules)
  );

  const priorityOrder = { REROLL: 1, TIER_UP: 2, KEEP: 3, STOP: 4 };

  return recommendations.sort((a, b) => {
    const pA = priorityOrder[a.verdict] || 5;
    const pB = priorityOrder[b.verdict] || 5;
    if (pA !== pB) return pA - pB;
    // Within same verdict group, sort by 100만 메소당 ROI descending
    return (b.target?.roiPerMillion || 0) - (a.target?.roiPerMillion || 0);
  });
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
    cubeValidLines: Math.min(3, Math.max(0, Number(eq.cubeValidLines !== undefined ? eq.cubeValidLines : 1))),
    potentialLines: Array.isArray(eq.potentialLines) ? JSON.parse(JSON.stringify(eq.potentialLines)) : null
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
      const currentCubeStats = getEquipmentCubeStats(eq);
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
      chosen.equipment.potentialLines = null;
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

/* ==========================================================================
   Exact Official Potential Option Parser & Joint Probability Combinatorics
   (Nexon Now Official settingPercent & 80% Confidence MekiCalc Spec)
   ========================================================================== */

/**
 * Parses official Nexon Now option text string into structured game stat delta.
 * E.g., '크리티컬 데미지 30%' -> { stat: 'critDamage', value: 30 }
 *       '스킬 재사용 대기시간 감소 1.5초' -> { stat: 'fixedCdr', value: 1.5 }
 *       'STR 6%' -> { stat: 'STR_PCT', value: 6 }
 */
export function parseOfficialPotentialOption(optStr, jobMainStat = 'STR') {
  if (!optStr || typeof optStr !== 'string') return { stat: 'NONE', value: 0 };
  const str = optStr.trim();
  let m;

  if ((m = str.match(/^스킬 재사용 대기시간 감소\s*([\d.]+)초/))) return { stat: 'fixedCdr', value: parseFloat(m[1]) };
  if ((m = str.match(/^크리티컬 데미지\s*([\d.]+)%/))) return { stat: 'critDamage', value: parseFloat(m[1]) };
  if ((m = str.match(/^크리티컬 확률\s*([\d.]+)%/))) return { stat: 'critRate', value: parseFloat(m[1]) };
  if ((m = str.match(/^공격 속도\s*([\d.]+)%/))) return { stat: 'attackSpeed', value: parseFloat(m[1]) };
  if ((m = str.match(/^공격력\s*([\d.]+)%/))) return { stat: 'attackPct', value: parseFloat(m[1]) };
  if ((m = str.match(/^공격력\s*([\d.]+)/))) return { stat: 'attackFlat', value: parseFloat(m[1]) };
  if ((m = str.match(/^데미지\s*([\d.]+)%/))) return { stat: 'damage', value: parseFloat(m[1]) };
  if ((m = str.match(/^최종 데미지\s*([\d.]+)%/))) return { stat: 'finalDamage', value: parseFloat(m[1]) };
  if ((m = str.match(/^보스 몬스터 데미지\s*([\d.]+)%/))) return { stat: 'bossDamage', value: parseFloat(m[1]) };
  if ((m = str.match(/^일반 몬스터 데미지\s*([\d.]+)%/))) return { stat: 'normalDamage', value: parseFloat(m[1]) };
  if ((m = str.match(/^스킬 데미지\s*([\d.]+)%/))) return { stat: 'skillDmg', value: parseFloat(m[1]) };
  if ((m = str.match(/^기본 공격 데미지\s*([\d.]+)%/))) return { stat: 'atkBasicDmg', value: parseFloat(m[1]) };
  if ((m = str.match(/^버프 지속시간 증가\s*([\d.]+)%/))) return { stat: 'buffDuration', value: parseFloat(m[1]) };
  if ((m = str.match(/^동료 소환 지속시간 증가\s*([\d.]+)%/))) return { stat: 'companionDuration', value: parseFloat(m[1]) };
  if ((m = str.match(/^기본 공격 대상 수 증가\s*([\d.]+)/))) return { stat: 'targetCountInc', value: parseFloat(m[1]) };
  if ((m = str.match(/^모든 스킬 레벨\s*([\d.]+)/))) return { stat: 'allSkillLevel', value: parseFloat(m[1]) };
  if ((m = str.match(/^4레벨당 주 스탯%\s*([\d.]+)%/))) return { stat: 'mainStatPct', value: parseFloat(m[1]) * 25 }; // Lv100 standard
  if ((m = str.match(/^1레벨당 주 스탯\s*([\d.]+)/))) return { stat: 'mainStat', value: parseFloat(m[1]) * 100 }; // Lv100 standard
  if ((m = str.match(/^최소 데미지 배율\s*([\d.]+)%/))) return { stat: 'minDamage', value: parseFloat(m[1]) };
  if ((m = str.match(/^최대 데미지 배율\s*([\d.]+)%/))) return { stat: 'maxDamage', value: parseFloat(m[1]) };
  if ((m = str.match(/^방어 관통력\s*([\d.]+)%/))) return { stat: 'defPen', value: parseFloat(m[1]) };

  if ((m = str.match(/^(STR|DEX|INT|LUK)\s*([\d.]+)%/))) {
    const isMain = m[1].toUpperCase() === jobMainStat.toUpperCase();
    return { stat: isMain ? 'mainStatPct' : 'subStatPct', value: parseFloat(m[2]) };
  }
  if ((m = str.match(/^(STR|DEX|INT|LUK)\s*([\d.]+)/))) {
    const isMain = m[1].toUpperCase() === jobMainStat.toUpperCase();
    return { stat: isMain ? 'mainStat' : 'subStat', value: parseFloat(m[2]) };
  }
  if ((m = str.match(/^방어력\s*([\d.]+)%/))) return { stat: 'playerDefense', value: parseFloat(m[1]) };
  if ((m = str.match(/^방어력\s*([\d.]+)/))) return { stat: 'playerDefense', value: parseFloat(m[1]) };
  if ((m = str.match(/^최대 HP\s*([\d.]+)%/))) return { stat: 'maxHp', value: parseFloat(m[1]) };
  if ((m = str.match(/^최대 HP\s*([\d.]+)/))) return { stat: 'maxHp', value: parseFloat(m[1]) };
  if ((m = str.match(/^최대 MP\s*([\d.]+)%/))) return { stat: 'maxMp', value: parseFloat(m[1]) };
  if ((m = str.match(/^최대 MP\s*([\d.]+)/))) return { stat: 'maxMp', value: parseFloat(m[1]) };

  return { stat: 'NONE', value: 0 };
}

/**
 * Converts array of 3 lines into aggregated player stat delta.
 */
export function convertLinesToStats(lines = [], jobMainStat = 'STR') {
  const stats = {};
  for (const line of lines) {
    if (!line) continue;
    let stat = line.stat;
    let val = Number(line.value) || 0;

    if (line.option) {
      const parsed = parseOfficialPotentialOption(line.option, jobMainStat);
      stat = parsed.stat;
      val = parsed.value;
    }

    if (!stat || stat === 'NONE' || !val) continue;

    // Normalization mapping
    if (stat === 'STR_PCT' || stat === 'DEX_PCT' || stat === 'INT_PCT' || stat === 'LUK_PCT') {
      const statName = stat.split('_')[0];
      stat = (statName === jobMainStat.toUpperCase()) ? 'mainStatPct' : 'subStatPct';
    } else if (stat === 'STR_FLAT' || stat === 'DEX_FLAT' || stat === 'INT_FLAT' || stat === 'LUK_FLAT') {
      const statName = stat.split('_')[0];
      stat = (statName === jobMainStat.toUpperCase()) ? 'mainStat' : 'subStat';
    }

    stats[stat] = (stats[stat] || 0) + val;
  }
  return stats;
}

/**
 * Calculates number of attempts to reach target confidence (default 80%) under Bernoulli trials.
 * n = ceil( ln(1 - confidence) / ln(1 - p) )
 */
export function calculateConfidenceAttempts(p, confidence = 0.80) {
  if (!p || p <= 0) return Infinity;
  if (p >= 1) return 1;
  const conf = Math.max(0.01, Math.min(0.9999, confidence));
  return Math.ceil(Math.log(1 - conf) / Math.log(1 - p));
}

/**
 * MekiCalc Full Combinatorial Potential Upgrade Evaluator
 * Evaluates exact net improvement probability, 80% confidence attempts, average attempts,
 * and cost-efficiency (ROI) for a given equipment slot and potential category (윗잠 / 아랫잠).
 *
 * @param {Object} equip Equipment data object
 * @param {Array} currentLines Current 3 potential lines
 * @param {Object} optionsData Potential probabilities dataset (grades.epic/unique/legendary/mystic)
 * @param {Object} playerStats Base player inputs
 * @param {Object} combatRules Combat rules
 * @param {Object} options Configuration { potentialCategory: 'upper'|'lower', confidence: 0.80, cubeCost: meso }
 */
export function calculateCubeImprovementProbability(equip, currentLines = [], optionsData = {}, playerStats = {}, combatRules = {}, options = {}) {
  const grade = equip.cubeGrade || 'epic';
  const slotName = equip.name || '모자';
  const confidence = options.confidence !== undefined ? options.confidence : 0.80;
  const isAdditional = options.potentialCategory === 'lower' || options.isAdditional;
  const costPerTry = options.cubeCost || (
    isAdditional
      ? (grade === 'rare' ? 120000 : grade === 'epic' ? 300000 : grade === 'unique' ? 900000 : 2200000)
      : (grade === 'rare' ? 80000 : grade === 'epic' ? 200000 : grade === 'unique' ? 600000 : 1500000)
  );

  let jobMainStat = 'STR';
  if (playerStats?.job) {
    if (['nightLord', 'shadower', 'nightWalker'].includes(playerStats.job)) jobMainStat = 'LUK';
    else if (['bowmaster', 'sniper', 'captain', 'windBreaker'].includes(playerStats.job)) jobMainStat = 'DEX';
    else if (['archMageIceLightning', 'archMageFirePoison', 'bishop'].includes(playerStats.job)) jobMainStat = 'INT';
  }

  // Normalize playerStats to ensure statBased is present
  const normalizedPlayer = {
    ...playerStats,
    statBased: playerStats.statBased !== undefined
      ? playerStats.statBased
      : ((Number(playerStats.mainStat) || 0) / 100 + (Number(playerStats.subStat) || 0) / 400)
  };

  // Baseline DPS with current 3 lines
  const currentCubeStats = convertLinesToStats(currentLines, jobMainStat);
  const baseStatsWithoutCube = subtractStatGains(normalizedPlayer, currentCubeStats);
  const currentDpsRes = calculateDamage(normalizedPlayer, combatRules);
  const currentDps = getEffectiveDPS(currentDpsRes);

  // Retrieve official slot blocks
  const gradeData = optionsData?.grades?.[grade];
  let blocks = gradeData?.blocks?.filter(b => b.equipment === slotName || b.equipment === equip.name);
  if (!blocks || blocks.length < 3) {
    // Fallback: match by first token or standard mapping
    blocks = gradeData?.blocks?.filter(b => slotName.startsWith(b.equipment) || b.equipment.startsWith(slotName));
  }

  if (!blocks || blocks.length < 3) {
    // If not found in blocks, fallback to standard estimation
    return {
      slotName,
      grade,
      category: isAdditional ? '아랫잠' : '윗잠',
      currentDps,
      netImprovementProbability: 0.15,
      attempts80Percent: calculateConfidenceAttempts(0.15, confidence),
      averageAttempts: Math.round(1 / 0.15),
      expectedCost80Percent: calculateConfidenceAttempts(0.15, confidence) * costPerTry,
      expectedAverageCost: Math.round(1 / 0.15) * costPerTry,
      expectedDpsGainPct: 1.5,
      roiPerMillion: 1.5 / ((calculateConfidenceAttempts(0.15, confidence) * costPerTry) / 1000000),
      topCandidateLines: []
    };
  }

  const sortedBlocks = [...blocks].sort((a, b) => (Number(a.slot) || 1) - (Number(b.slot) || 1));
  const slot1Options = sortedBlocks[0]?.options || [];
  const slot2Options = sortedBlocks[1]?.options || [];
  const slot3Options = sortedBlocks[2]?.options || [];

  let betterProbSum = 0;
  let totalSampleCount = 0;
  let weightedGainSum = 0;
  let bestCandidate = null;
  let maxDelta = 0;

  // Exact joint distribution iteration across 3 slots
  for (let i = 0; i < slot1Options.length; i++) {
    const opt1 = slot1Options[i];
    const p1 = (Number(opt1.settingPercent) || 0) / 100;
    if (p1 <= 0) continue;
    const stat1 = parseOfficialPotentialOption(opt1.option, jobMainStat);

    for (let j = 0; j < slot2Options.length; j++) {
      const opt2 = slot2Options[j];
      const p2 = (Number(opt2.settingPercent) || 0) / 100;
      if (p2 <= 0) continue;
      const stat2 = parseOfficialPotentialOption(opt2.option, jobMainStat);

      for (let k = 0; k < slot3Options.length; k++) {
        const opt3 = slot3Options[k];
        const p3 = (Number(opt3.settingPercent) || 0) / 100;
        if (p3 <= 0) continue;
        const stat3 = parseOfficialPotentialOption(opt3.option, jobMainStat);

        const jointProb = p1 * p2 * p3;
        totalSampleCount++;

        const candidateStats = {};
        for (const s of [stat1, stat2, stat3]) {
          if (s.stat && s.stat !== 'NONE' && s.value > 0) {
            candidateStats[s.stat] = (candidateStats[s.stat] || 0) + s.value;
          }
        }

        const candidatePlayerStats = applyStatGains(baseStatsWithoutCube, candidateStats);
        const candDpsRes = calculateDamage(candidatePlayerStats, combatRules);
        const candDps = getEffectiveDPS(candDpsRes);

        if (candDps > currentDps * 1.0001) {
          betterProbSum += jointProb;
          const gainPct = ((candDps - currentDps) / currentDps) * 100;
          weightedGainSum += jointProb * gainPct;

          if (candDps - currentDps > maxDelta) {
            maxDelta = candDps - currentDps;
            bestCandidate = {
              lines: [opt1.option, opt2.option, opt3.option],
              dps: candDps,
              gainPct
            };
          }
        }
      }
    }
  }

  const pImprove = Math.max(0.00001, Math.min(0.9999, betterProbSum));
  const avgAttempts = Math.round(1 / pImprove);
  const attempts80 = calculateConfidenceAttempts(pImprove, confidence);
  const cost80 = attempts80 * costPerTry;
  const avgCost = avgAttempts * costPerTry;
  const avgExpectedGainPct = betterProbSum > 0 ? (weightedGainSum / betterProbSum) : 0;
  const roiPerMillion = cost80 > 0 ? (avgExpectedGainPct / (cost80 / 1000000)) : 0;

  return {
    slotName,
    grade,
    category: isAdditional ? '아랫잠' : '윗잠',
    currentDps,
    costPerTry,
    netImprovementProbability: pImprove,
    attempts80Percent: attempts80,
    averageAttempts: avgAttempts,
    expectedCost80Percent: cost80,
    expectedAverageCost: avgCost,
    expectedDpsGainPct: avgExpectedGainPct,
    roiPerMillion,
    bestCandidate
  };
}

