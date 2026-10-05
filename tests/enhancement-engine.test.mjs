import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getStarforceAttemptCost,
  getStarforceStatGain,
  calculateStarforcePath,
  calculateScrollEnhancement,
  applyStatGains,
  optimizeSpecUpPath
} from '../enhancement-engine.mjs';
import { calculateDamage } from '../engine.mjs';

const probabilities = JSON.parse(fs.readFileSync('data/probabilities.json', 'utf8'));
const enhancementRules = JSON.parse(fs.readFileSync('data/enhancement-rules.json', 'utf8'));
const combatRules = JSON.parse(fs.readFileSync('data/combat-rules.json', 'utf8'));

// 1. Star Force Attempt Cost
const cost0 = getStarforceAttemptCost(0, 120);
const cost10 = getStarforceAttemptCost(10, 120);
const cost15 = getStarforceAttemptCost(15, 120);
assert.ok(cost0 > 0, '0-star cost must be positive');
assert.ok(cost10 > cost0, '10-star cost must be greater than 0-star cost');
assert.ok(cost15 > cost10, '15-star cost must be greater than 10-star cost');

// 2. Star Force Path Markov Chain Tests
// 2.1 0 to 5 stars (safe zone: no downgrade, no destroy)
const sf0to5 = calculateStarforcePath(0, 5, {
  itemLevel: 120,
  slotType: 'weapon',
  probabilities: probabilities.starforce,
  rules: enhancementRules.starforce
});
assert.equal(sf0to5.fromStar, 0);
assert.equal(sf0to5.toStar, 5);
assert.ok(sf0to5.totalCost > 0);
assert.ok(sf0to5.totalAttempts >= 5, 'Must take at least 5 attempts');
assert.equal(sf0to5.totalDestroys, 0, 'No destroys allowed between 0 and 5 stars');
assert.ok(sf0to5.statGains.attackFlat > 0, 'Weapon starforce must grant flat attack');

// 2.2 10 to 12 stars
const sf10to12 = calculateStarforcePath(10, 12, {
  itemLevel: 120,
  slotType: 'glove',
  probabilities: probabilities.starforce,
  rules: enhancementRules.starforce
});
assert.ok(sf10to12.totalCost > 0);
assert.ok(sf10to12.totalAttempts > 2, 'Attempts must account for failure/stay');
assert.equal(sf10to12.totalDestroys, 0, 'No destroys below 20 stars');

// 2.3 20 to 22 stars (danger zone: destroy and downgrade possible)
const sf20to22 = calculateStarforcePath(20, 22, {
  itemLevel: 120,
  slotType: 'weapon',
  probabilities: probabilities.starforce,
  rules: enhancementRules.starforce
});
assert.ok(sf20to22.totalDestroys > 0, 'Expected destroys must be positive in 20+ star range');
assert.ok(sf20to22.totalCost > sf10to12.totalCost, '20+ star range cost must far exceed 10-12 star range');

// 3. Scroll Enhancement Tests
const sc100 = calculateScrollEnhancement(8, 8, 'scroll100', { slotType: 'weapon', rules: enhancementRules });
assert.equal(sc100.expectedScrolls, 8, '100% scroll on 8 slots needs exactly 8 scrolls');
assert.equal(sc100.expectedCleanSlates, 0, '100% scroll has 0 fails, needs 0 clean slates');
assert.equal(sc100.statGains.attackFlat, 16, '8 slots x 2 attack = 16 attack');

const sc70 = calculateScrollEnhancement(1, 1, 'scroll70', { slotType: 'weapon', rules: enhancementRules });
assert.ok(Math.abs(sc70.expectedScrolls - 1 / 0.7) < 0.001, '70% scroll expects 1/0.7 attempts');
assert.ok(sc70.expectedCleanSlates > 0, '70% scroll expects positive clean slate recoveries');

// 4. Dynamic Bucket Saturation / Diminishing Returns Test (User's specific requirement!)
const baseStats = {
  attackFlat: 2000,
  attackPct: 20,
  mainStat: 5000,
  subStat: 1000,
  damage: 50,
  bossDamage: 50,
  target: 'boss',
  critRate: 100,
  critDamage: 30,
  skillCoefficient: 100,
  attackInterval: 0.8,
  accuracy: 100
};

// Case A: Adding 15% Boss Damage when Boss Damage is low (50%)
const dpsLowBoss = calculateDamage(baseStats, combatRules).dps;
const dpsLowBossPlus = calculateDamage({ ...baseStats, bossDamage: baseStats.bossDamage + 15 }, combatRules).dps;
const gainLowBossPct = (dpsLowBossPlus / dpsLowBoss - 1) * 100;

// Case B: Adding 15% Boss Damage when Boss Damage is already saturated (250%)
const highBossStats = { ...baseStats, bossDamage: 250 };
const dpsHighBoss = calculateDamage(highBossStats, combatRules).dps;
const dpsHighBossPlus = calculateDamage({ ...highBossStats, bossDamage: highBossStats.bossDamage + 15 }, combatRules).dps;
const gainHighBossPct = (dpsHighBossPlus / dpsHighBoss - 1) * 100;

assert.ok(gainLowBossPct > gainHighBossPct, 'Adding Boss Damage must have higher relative gain when not saturated');

// Case C: Adding Crit Damage when Crit Rate is 100% vs 20%
const highCritStats = { ...baseStats, critRate: 100, critDamage: 30 };
const lowCritStats = { ...baseStats, critRate: 20, critDamage: 30 };
const dpsHighCritGain = (calculateDamage({ ...highCritStats, critDamage: 40 }, combatRules).dps / calculateDamage(highCritStats, combatRules).dps - 1) * 100;
const dpsLowCritGain = (calculateDamage({ ...lowCritStats, critDamage: 40 }, combatRules).dps / calculateDamage(lowCritStats, combatRules).dps - 1) * 100;
assert.ok(dpsHighCritGain > dpsLowCritGain, 'Adding Crit Damage must yield higher DPS increase when Crit Rate is high');

// 5. Spec-Up Portfolio Optimizer (Greedy Frontier)
const equips = [
  { name: '무기', slotType: 'weapon', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 8, scrollSlotsUsed: 4, cubeGrade: 'unique' },
  { name: '장갑', slotType: 'glove', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 7, scrollSlotsUsed: 5, cubeGrade: 'epic' },
  { name: '하의', slotType: 'armor', itemLevel: 120, currentStar: 8, maxStar: 15, scrollSlotsTotal: 7, scrollSlotsUsed: 7, cubeGrade: 'rare' }
];

const roadmap = optimizeSpecUpPath({
  budgetMeso: 50000000, // 50M meso
  playerInputs: baseStats,
  equipmentList: equips,
  enhancementRules,
  starforceProbabilities: probabilities.starforce,
  potentialProbabilities: probabilities.normalPotentialPartial,
  combatRules,
  maxSteps: 20
});

assert.ok(roadmap.steps.length > 0, 'Optimizer must produce upgrade steps');
assert.ok(roadmap.finalDps > roadmap.initialDps, 'Final DPS must be strictly greater than initial DPS');
assert.ok(roadmap.totalDpsGainPct > 0, 'Total DPS gain percent must be positive');
assert.ok(roadmap.budgetUsed <= roadmap.budgetTotal, 'Budget used must not exceed total budget');
assert.ok(roadmap.budgetRemaining >= 0, 'Remaining budget must be non-negative');

// Verify that each step had positive ROI and properly updated cumulative stats
for (let i = 0; i < roadmap.steps.length; i++) {
  const step = roadmap.steps[i];
  assert.ok(step.cost > 0, `Step ${i + 1} cost must be positive`);
  assert.ok(step.dpsDelta >= 0, `Step ${i + 1} DPS delta must be non-negative`);
  assert.ok(step.roi >= 0, `Step ${i + 1} ROI must be non-negative`);
}

// 6. Edge Case Tests
// Case 6A: Zero Budget
const zeroBudgetRes = optimizeSpecUpPath({
  budgetMeso: 0,
  playerInputs: baseStats,
  equipmentList: equips,
  enhancementRules,
  starforceProbabilities: probabilities.starforce,
  potentialProbabilities: probabilities.normalPotentialPartial,
  combatRules
});
assert.equal(zeroBudgetRes.steps.length, 0, 'Zero budget must produce 0 steps');
assert.equal(zeroBudgetRes.initialDps, zeroBudgetRes.finalDps, 'Zero budget must keep DPS unchanged');
assert.equal(zeroBudgetRes.budgetUsed, 0, 'Zero budget must use 0 meso');

// Case 6B: Insufficient Budget (100 meso)
const tinyBudgetRes = optimizeSpecUpPath({
  budgetMeso: 100,
  playerInputs: baseStats,
  equipmentList: equips,
  enhancementRules,
  starforceProbabilities: probabilities.starforce,
  potentialProbabilities: probabilities.normalPotentialPartial,
  combatRules
});
assert.equal(tinyBudgetRes.steps.length, 0, 'Tiny budget insufficient for any upgrade must produce 0 steps');

// Case 6C: Already Maxed Equipment
const maxedEquips = [
  { name: '종결 무기', slotType: 'weapon', itemLevel: 140, currentStar: 15, maxStar: 15, scrollSlotsTotal: 8, scrollSlotsUsed: 8, cubeGrade: 'legendary', cubeValidLines: 2 }
];
const maxedRes = optimizeSpecUpPath({
  budgetMeso: 100000000,
  playerInputs: baseStats,
  equipmentList: maxedEquips,
  enhancementRules,
  starforceProbabilities: probabilities.starforce,
  potentialProbabilities: probabilities.normalPotentialPartial,
  combatRules
});
assert.equal(maxedRes.steps.length, 0, 'Maxed equipment must produce 0 steps');

// Case 6D: Large Budget (500M meso) with high step cap
const bigBudgetRes = optimizeSpecUpPath({
  budgetMeso: 500000000,
  playerInputs: baseStats,
  equipmentList: equips,
  enhancementRules,
  starforceProbabilities: probabilities.starforce,
  potentialProbabilities: probabilities.normalPotentialPartial,
  combatRules,
  maxSteps: 30
});
assert.ok(bigBudgetRes.steps.length > 5, 'Big budget must yield multiple upgrade steps');
assert.ok(bigBudgetRes.finalDps > roadmap.finalDps, 'Larger budget must yield equal or greater DPS than 50M budget');

// 7. Markov Chain & Scroll Invariants
// Invariant 7A: In safe zone (0~5 stars), path is strictly additive
const sf0to3 = calculateStarforcePath(0, 3, { itemLevel: 120, slotType: 'weapon', probabilities: probabilities.starforce, rules: enhancementRules.starforce });
const sf3to5 = calculateStarforcePath(3, 5, { itemLevel: 120, slotType: 'weapon', probabilities: probabilities.starforce, rules: enhancementRules.starforce });
const sf0to5_check = calculateStarforcePath(0, 5, { itemLevel: 120, slotType: 'weapon', probabilities: probabilities.starforce, rules: enhancementRules.starforce });
assert.ok(Math.abs((sf0to3.totalCost + sf3to5.totalCost) - sf0to5_check.totalCost) < 1, 'Safe starforce path cost must be strictly additive');

// Invariant 7B: 15% scroll requires strictly more attempts and clean slates than 70% scroll
const sc15 = calculateScrollEnhancement(0, 5, 'scroll15', { slotType: 'weapon', rules: enhancementRules });
const sc70_5 = calculateScrollEnhancement(0, 5, 'scroll70', { slotType: 'weapon', rules: enhancementRules });
assert.ok(sc15.expectedScrolls > sc70_5.expectedScrolls, '15% scroll expects more scrolls than 70%');
assert.ok(sc15.expectedCleanSlates > sc70_5.expectedCleanSlates, '15% scroll expects more clean slates than 70%');

import {
  recommendCubeAction,
  rankAllEquipmentCubes,
  getEquipmentCubeStats,
  getInGamePreferredCubeSettings
} from '../enhancement-engine.mjs';

// 8.1 getEquipmentCubeStats with explicit lines vs fallback
const eqWithLines = {
  slotType: 'weapon',
  cubeGrade: 'unique',
  potentialLines: [
    { stat: 'attackPct', value: 9, label: '공격력 +9%' },
    { stat: 'bossDamage', value: 12, label: '보스 데미지 +12%' },
    { stat: 'NONE', value: 0, label: '잡옵' }
  ]
};
const statsFromLines = getEquipmentCubeStats(eqWithLines);
assert.equal(statsFromLines.attackPct, 9);
assert.equal(statsFromLines.bossDamage, 12);
assert.equal(statsFromLines.mainStatPct, undefined);

const eqFallback = { slotType: 'weapon', cubeGrade: 'unique', cubeValidLines: 1 };
const statsFallback = getEquipmentCubeStats(eqFallback);
assert.equal(statsFallback.attackPct, 9);

// 8.2 recommendCubeAction verdicts
// 8.2A REROLL for 0-line item (garbage lines)
const eqGarbage = {
  id: 'hat',
  name: '모자',
  slotType: 'armor',
  cubeGrade: 'epic',
  cubeValidLines: 0,
  potentialLines: [
    { stat: 'NONE', value: 0 },
    { stat: 'NONE', value: 0 },
    { stat: 'NONE', value: 0 }
  ]
};
const recGarbage = recommendCubeAction(eqGarbage, baseStats, combatRules, enhancementRules);
assert.equal(recGarbage.verdict, 'REROLL', '0-line item must have REROLL verdict');
assert.ok(recGarbage.target.roiPerMillion > 0, 'Reroll on 0-line item must yield positive ROI');

// 8.2B TIER_UP for rare item
const eqRare = {
  id: 'cape',
  name: '망토',
  slotType: 'armor',
  cubeGrade: 'rare',
  cubeValidLines: 1
};
const recRare = recommendCubeAction(eqRare, baseStats, combatRules, enhancementRules);
assert.equal(recRare.verdict, 'TIER_UP', 'Rare item must recommend TIER_UP');

// 8.2C STOP for 2-line unique weapon
const eqFinished = {
  id: 'weapon',
  name: '무기',
  slotType: 'weapon',
  cubeGrade: 'unique',
  cubeValidLines: 2,
  potentialLines: [
    { stat: 'attackPct', value: 9 },
    { stat: 'bossDamage', value: 12 },
    { stat: 'NONE', value: 0 }
  ]
};
const recFinished = recommendCubeAction(eqFinished, baseStats, combatRules, enhancementRules);
assert.equal(recFinished.verdict, 'STOP', '2-line unique weapon must have STOP verdict');

// 8.2D STOP for unique glove with crit damage
const eqGlove = {
  id: 'glove',
  name: '장갑',
  slotType: 'glove',
  cubeGrade: 'unique',
  cubeValidLines: 1,
  potentialLines: [
    { stat: 'critDamage', value: 4 },
    { stat: 'NONE', value: 0 },
    { stat: 'NONE', value: 0 }
  ]
};
const recGlove = recommendCubeAction(eqGlove, baseStats, combatRules, enhancementRules);
assert.equal(recGlove.verdict, 'STOP', 'Unique glove with crit damage must have STOP verdict');

// 8.3 rankAllEquipmentCubes Leaderboard sorting
const testEquips = [eqFinished, eqGarbage, eqRare, eqGlove];
const ranked = rankAllEquipmentCubes(testEquips, baseStats, combatRules, enhancementRules);
assert.equal(ranked[0].equipmentId, 'hat', 'First recommendation must be the 0-line REROLL item');
assert.equal(ranked[1].equipmentId, 'cape', 'Second recommendation should be TIER_UP item');
assert.ok(ranked[ranked.length - 1].verdict === 'STOP', 'Last recommendations must be STOP items');
assert.ok(ranked[0].preferredSettings, 'Ranked items must include preferredSettings');

// 9. In-Game Preferred Cube Settings Tests (Auto-Cube Stop Condition 1, 2, 3)
// 9.1 Weapon with Night Walker (LUK job)
const nwWeaponPref = getInGamePreferredCubeSettings('weapon', 'epic', 'nightWalker');
assert.equal(nwWeaponPref.mainStat, 'LUK', 'Night Walker main stat must be LUK');
assert.equal(nwWeaponPref.tierUpMode, 'OFF', 'Weapon at epic does not require tier-up stop mode');
assert.equal(nwWeaponPref.presets.length, 3, 'Must provide 3 in-game condition presets');
assert.equal(nwWeaponPref.presets[0].minCount, '3개 이상');
assert.equal(nwWeaponPref.presets[1].minCount, '2개 이상');
assert.ok(nwWeaponPref.presets[1].options.includes('공격력%'), 'Weapon preset 2 must include 공격력%');
assert.ok(nwWeaponPref.presets[1].options.includes('보스 몬스터 데미지%'), 'Weapon preset 2 must include 보스 몬스터 데미지%');

// 9.2 Glove at Epic with Hero (STR job) - Tier-Up Mode must be ON
const heroGlovePref = getInGamePreferredCubeSettings('glove', 'epic', 'hero');
assert.equal(heroGlovePref.mainStat, 'STR', 'Hero main stat must be STR');
assert.equal(heroGlovePref.tierUpMode, 'ON (권장)', 'Glove at epic MUST recommend tier-up mode ON for crit damage');
assert.equal(heroGlovePref.presets[2].minCount, '1개 이상');
assert.ok(heroGlovePref.presets[2].options.includes('크리티컬 데미지%'), 'Glove preset 3 must include 크리티컬 데미지%');

// 9.3 Hat with Bishop (INT job) - Cooldown reduction
const bishopHatPref = getInGamePreferredCubeSettings('hat', 'legendary', 'bishop');
assert.equal(bishopHatPref.mainStat, 'INT', 'Bishop main stat must be INT');
assert.ok(bishopHatPref.presets[0].options.includes('스킬 재사용 대기시간 감소'), 'Hat preset 1 must include cooldown reduction');
assert.ok(bishopHatPref.presets[1].options.includes('스킬 재사용 대기시간 감소'), 'Hat preset 2 must include cooldown reduction');

// 9.4 Armor with Bowmaster (DEX job) at Rare
const bmArmorPref = getInGamePreferredCubeSettings('armor', 'rare', 'bowmaster');
assert.equal(bmArmorPref.mainStat, 'DEX', 'Bowmaster main stat must be DEX');
assert.equal(bmArmorPref.tierUpMode, 'ON (권장)', 'Rare armor must recommend tier-up mode ON');
assert.ok(bmArmorPref.presets[1].options.includes('DEX%'), 'Armor preset 2 must include DEX% for bowmaster');

// 10. MekiCalc 80% Confidence Cube Improvement Probability Tests
const potentialProbabilities = JSON.parse(fs.readFileSync('data/potential-probabilities.json', 'utf8'));
const testGlove = { id: 'glove', name: '장갑', slotType: 'glove', cubeGrade: 'unique' };
const testPlayerStats = {
  attackFlat: 2000,
  attackPct: 20,
  mainStat: 5000,
  subStat: 1000,
  damage: 50,
  bossDamage: 50,
  target: 'boss',
  critRate: 100,
  critDamage: 50,
  mainStatPct: 6,
  skillCoefficient: 100,
  attackInterval: 0.8,
  accuracy: 100
};

// 10.1 0-valid-line glove should have high improvement chance
const cubeProb0Line = (await import('../enhancement-engine.mjs')).calculateCubeImprovementProbability(
  testGlove,
  [{ stat: 'NONE', value: 0 }, { stat: 'NONE', value: 0 }, { stat: 'NONE', value: 0 }],
  potentialProbabilities,
  testPlayerStats,
  combatRules,
  { confidence: 0.80 }
);
assert.ok(cubeProb0Line.netImprovementProbability > 0.5, '0-line glove must have >50% improvement probability');
assert.ok(cubeProb0Line.attempts80Percent >= 1, '80% attempts must be at least 1');
assert.ok(cubeProb0Line.expectedCost80Percent > 0, '80% cost must be positive');
assert.ok(cubeProb0Line.roiPerMillion > 0, 'ROI must be positive');

// 10.2 2-valid-line glove with critDamage + mainStatPct should have selective improvement chance
const cubeProb2Line = (await import('../enhancement-engine.mjs')).calculateCubeImprovementProbability(
  testGlove,
  [{ stat: 'critDamage', value: 20 }, { stat: 'mainStatPct', value: 6 }, { stat: 'NONE', value: 0 }],
  potentialProbabilities,
  testPlayerStats,
  combatRules,
  { confidence: 0.80 }
);
assert.ok(cubeProb2Line.netImprovementProbability < cubeProb0Line.netImprovementProbability, 'Better current lines must have lower improvement probability');
assert.ok(cubeProb2Line.attempts80Percent > cubeProb0Line.attempts80Percent, 'Better current lines require more attempts for 80% confidence');

// 11. Inventory Constrained Roadmap Tests
const invConstrainedRes = optimizeSpecUpPath({
  budgetMeso: 50000000,
  inventory: { starforceScrolls: 0, spellTraces: 0, miracleCubes: 100, additionalCubes: 50 },
  playerInputs: baseStats,
  equipmentList: equips,
  enhancementRules,
  starforceProbabilities: probabilities.starforce,
  potentialProbabilities: probabilities.normalPotentialPartial,
  combatRules,
  maxSteps: 10
});
assert.ok(!invConstrainedRes.steps.some(s => s.type === 'starforce'), 'When starforce scrolls are 0, no starforce steps should be generated');
assert.ok(!invConstrainedRes.steps.some(s => s.type === 'scroll'), 'When spell traces are 0, no scroll steps should be generated');
assert.ok(invConstrainedRes.steps.every(s => s.type === 'cube' || s.type === 'additional_cube'), 'All steps must be cube steps when scrolls are 0');
assert.ok(invConstrainedRes.resourcesUsed.starforceScrolls === 0);
assert.ok(invConstrainedRes.resourcesUsed.miracleCubes > 0);

console.log('enhancement-engine tests (including edge cases & invariants) passed cleanly!');
console.log(`Initial DPS: ${roadmap.initialDps.toFixed(1)} -> Final DPS: ${roadmap.finalDps.toFixed(1)} (+${roadmap.totalDpsGainPct.toFixed(2)}%)`);
console.log(`Budget Used: ${roadmap.budgetUsed.toLocaleString()} / ${roadmap.budgetTotal.toLocaleString()} meso across ${roadmap.steps.length} steps`);
console.log('Top recommended initial steps:');
roadmap.steps.slice(0, 3).forEach((s, idx) => {
  console.log(`  ${idx + 1}. ${s.description} (비용: ${Math.round(s.cost).toLocaleString()} 메소, DPS +${s.dpsGainPct.toFixed(2)}%, ROI: ${s.roi.toFixed(4)})`);
});
console.log(`MekiCalc Cube Leaderboard verified (${ranked.length} items evaluated): #1 ${ranked[0].equipmentName} [${ranked[0].verdictLabel}]`);

