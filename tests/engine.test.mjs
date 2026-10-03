import assert from 'node:assert/strict';
import { calculateCombatPower, calculateDamage, calculateDps, calculateEffectiveCooldown, calculateMultiTargetDps, calculatePvpDamage, calculateStatEfficiencies, cubeTargetSummary, probabilitySummary } from '../engine.mjs';

const base = { attackFlat: 1000, attackPct: 0, targetDefense: 0, defPen: 0, target: 'normal', targetTaken: 0, damage: 0, damageAmp: 0, normalDamage: 0, bossDamage: 0, basicDamage: 0, skillDamage: 0, statBased: 0, mastery: 0, critRate: 0, critDamage: 0, minDamage: 100, maxDamage: 100, finalDamage: 0, skillCoefficient: 100, accuracy: 100, attackInterval: 1, attackSpeed: 0 };
const rules = { caps: { defensePenetration: 1000, attackSpeed: 1500 }, battlePower: { base: 'attack*3 + maxHp*0.05 + defense*0.2' } };

let r = calculateDamage(base, rules);
assert.equal(r.average, 1000, 'baseline damage should equal attack when every multiplier is neutral');
assert.equal(r.dps, 1000, 'baseline DPS should equal damage at one-second interval');
assert.equal(calculateDps(1000, base, rules).dps, 1000, 'DPS helper should match calculateDamage');

r = calculateDamage({ ...base, statBased: 10 }, rules);
assert.equal(r.average, 1100, '10% stat-based damage should apply as a 1.1 multiplier');

r = calculateDamage({ ...base, targetDefense: 6000 }, rules);
assert.equal(r.defenseFactor, 5000 / 12000, 'defense formula must use +6000 denominator');

r = calculateDamage({ ...base, targetDefense: 6000, defPen: 100 }, rules);
assert.equal(r.afterDef, 0, '100% penetration should remove target defense');
assert.equal(r.defenseFactor, 5000 / 6000);

const normal = calculateDamage({ ...base, target: 'normal', normalDamage: 20, bossDamage: 80 }, rules);
const boss = calculateDamage({ ...base, target: 'boss', normalDamage: 20, bossDamage: 80 }, rules);
assert.equal(normal.average, 1200, 'normal damage should use normal-only bonus');
assert.equal(boss.average, 1800, 'boss damage should use boss-only bonus');

const p = probabilitySummary(5, 10);
assert.equal(Number((p.probability * 100).toFixed(4)), 40.1263);
assert.equal(p.expectedAttempts, 20);
assert.equal(p.need90, 45);
assert.equal(p.need95, 59);

r = calculateDamage({ ...base, attackSpeed: 300 }, rules);
assert.equal(r.capsApplied.attackSpeed, 150);
assert.equal(r.speedFactor, 2.5);

r = calculateDamage({ ...base, defPen: 50, defPenAdditions: [20] }, rules);
assert.equal(Number(r.effectiveDefPen.toFixed(6)), 60, 'defense penetration additions use remaining-gap diminishing');

r = calculateDamage({ ...base, attackSpeed: 100, attackSpeedAdditions: [20] }, rules);
assert.equal(Number(r.effectiveAttackSpeed.toFixed(6)), 106.666667, 'attack speed additions use remaining-gap diminishing');

const power = calculateCombatPower({ attackFlat: 1000, attackPct: 0, maxHp: 0, playerDefense: 0, maxMp: 500, minDamage: 65, maxDamage: 100, accuracy: 0 }, rules);
assert.equal(power.power, 3000, 'neutral battle-power inputs should equal attack*3');
const powered = calculateCombatPower({ attackFlat: 1000, maxHp: 10000, playerDefense: 5000, maxMp: 1500, damage: 20, attackSpeed: 10, critRate: 50, critDamage: 20, minDamage: 65, maxDamage: 100, accuracy: 100 }, rules);
assert.ok(powered.power > power.power, 'positive battle-power stats should increase power');


const pvpBase = { ...base, target: 'pvp', pvpContent: 'arena', level: 30, targetMaxHp: 100000, targetReceivedDamageReduction: 0, accuracy: 100, defPen: 20, damage: 50, damageAmp: 20, basicDamage: 30, skillDamage: 40, statBased: 10, critRate: 50, critDamage: 30, minDamage: 65, maxDamage: 100, finalDamage: 20, skillCoefficient: 100 };
const pvp = calculatePvpDamage(pvpBase, { ...rules, pvp: { constants: { arena: 7206000000, worldArena: 5764800000, colosseum: 4323600000 } } });
assert.ok(Number.isFinite(pvp.average) && pvp.average > 0, 'PvP damage should be finite and positive');
assert.equal(pvp.levelAdjustment, 1, 'level 30 should have no PvP level penalty');
const pvpHigherDefense = calculatePvpDamage({ ...pvpBase, targetDefense: 10000 }, { ...rules, pvp: { constants: { arena: 7206000000 } } });
assert.ok(pvpHigherDefense.average < pvp.average, 'higher target defense should reduce PvP damage');
const colosseum = calculatePvpDamage({ ...pvpBase, pvpContent: 'colosseum', level: 120 }, { ...rules, pvp: { constants: { colosseum: 4323600000 } } });
assert.ok(colosseum.average < pvp.average, 'Colosseum constant and level penalty should reduce damage');

const cubeSlots = [{ option: 'A', settingPercent: 2.5 }, { option: 'B', settingPercent: 4 }];
const cube = cubeTargetSummary([cubeSlots, cubeSlots, cubeSlots], ['A'], 'any', 1000);
assert.equal(Number((cube.probability * 100).toFixed(4)), 7.3141, 'three-slot target probability should combine independent slot chances');
assert.equal(Number(cube.expectedAttempts.toFixed(4)), 13.6723, 'expected cube count should use the one-or-more target probability');
assert.equal(Number(cube.expectedCost.toFixed(2)), 13672.29, 'expected cube cost should use cube cost');
const cubeAll = cubeTargetSummary([cubeSlots, cubeSlots, cubeSlots], ['A', 'B'], 'all');
assert.equal(Number((cubeAll.probability * 100).toFixed(4)), 0.5805, 'all-target probability should require every selected option');

// Exact 3-slot reroll state model tests
const slotA = [{ option: 'A', settingPercent: 10 }, { option: 'B', settingPercent: 90 }];
const rerollMiss = cubeTargetSummary([slotA, slotA, slotA], ['A'], 'any', 100, ['B', 'B', 'B']);
assert.equal(rerollMiss.rerollExclusion.rerollAdjusted, true);
assert.equal(Number((rerollMiss.rerollExclusion.sameProbability * 100).toFixed(2)), 72.9);
assert.equal(rerollMiss.probability, 1, 'when current options is the only miss state, reroll probability to hit target must be 100%');

const rerollHit = cubeTargetSummary([slotA, slotA, slotA], ['A'], 'any', 100, ['A', 'B', 'B']);
assert.equal(rerollHit.rerollExclusion.currentIsGoal, true);
assert.equal(Number((rerollHit.probability * 100).toFixed(4)), 20.6746, 'reroll probability when current state is a goal state should exclude exact current state');

// Cooldown reduction and multi-target DPS tests
assert.equal(calculateEffectiveCooldown(10, 20, 1), 7, '10s - 20% = 8s (>7s), minus 1s = 7s');
assert.equal(calculateEffectiveCooldown(6, 0, 2), 5, '6s (<7s) reduces fixed CDR rate to 0.5x, so 6 - 1 = 5s');
assert.equal(calculateEffectiveCooldown(5, 50, 4), 4, 'final cooldown cannot drop below 4 seconds cap');

const multiDps = calculateMultiTargetDps(1000, 2);
assert.equal(multiDps.multiTargetDps, 3000, '3 total targets (1 base + 2 bonus) should triple multi-target DPS');

const pvpCritResist = calculatePvpDamage({ ...pvpBase, critRate: 60, targetCritResist: 20 }, { ...rules, pvp: { constants: { arena: 7206000000 } } });
assert.equal(pvpCritResist.effectiveCritRate, 40, 'PvP target crit resistance should subtract from attacker crit rate');

// Marginal Stat Efficiency tests
const effs = calculateStatEfficiencies(base, rules);
assert.ok(Array.isArray(effs) && effs.length === 12, 'calculateStatEfficiencies should return array of 12 ranked stat gains');
assert.equal(effs[0].key, 'ATK_FLAT', '+1,000 attack flat on 1,000 base should give top percentage DPS increase (+100%)');

// Dataset Integrity Tests
import fs from 'node:fs';

const bossData = JSON.parse(fs.readFileSync('data/boss-data.json', 'utf8'));
assert.ok(bossData.pinkbean_raid.length >= 6, 'pinkbean_raid should have at least 6 difficulty rows');
assert.ok(bossData.boss_raid.length >= 16, 'boss_raid should have at least 16 difficulty rows');
assert.ok(bossData.world_boss.length >= 20, 'world_boss should have 20 level rows');

const growthData = JSON.parse(fs.readFileSync('data/growth-dungeon-data.json', 'utf8'));
assert.equal(growthData.weapon_dungeon.length, 150, 'weapon_dungeon should have 150 stage rows');
assert.equal(growthData.exp_dungeon.length, 150, 'exp_dungeon should have 150 stage rows');
assert.equal(growthData.gear_dungeon.length, 150, 'gear_dungeon should have 150 stage rows');
assert.equal(growthData.training_ground.length, 150, 'training_ground should have 150 stage rows');
assert.equal(growthData.enhance_dungeon.length, 150, 'enhance_dungeon should have 150 stage rows');

const guildData = JSON.parse(fs.readFileSync('data/guild-data.json', 'utf8'));
assert.equal(guildData.guild_boss.length, 51, 'guild_boss should have 51 tier rows');
assert.equal(guildData.guild_league.length, 81, 'guild_league should have 81 wave rows');
assert.equal(guildData.training_regular.length, 50, 'training_regular should have 50 stage rows');
assert.equal(guildData.training_special.length, 50, 'training_special should have 50 stage rows');

const dropData = JSON.parse(fs.readFileSync('data/drop-table-data.json', 'utf8'));
assert.ok(dropData.pq_meta.first, 'dropTableData should contain PQ metadata for first companion');
assert.ok(dropData.rates.easy.normal, 'dropTableData should contain rates');

// Syntax & Identifier Integrity Test for app.js
import vm from 'node:vm';
const appCode = fs.readFileSync('app.js', 'utf8');
assert.doesNotThrow(() => {
  new vm.Script(appCode.replace(/^import\s+.*?;\s*$/gm, ''));
}, 'app.js must parse cleanly without syntax or redeclaration errors');

console.log('engine tests passed');

