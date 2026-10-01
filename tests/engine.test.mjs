import assert from 'node:assert/strict';
import { calculateDamage, probabilitySummary } from '../engine.mjs';

const base = { attackFlat: 1000, attackPct: 0, targetDefense: 0, defPen: 0, target: 'normal', targetTaken: 0, damage: 0, damageAmp: 0, normalDamage: 0, bossDamage: 0, basicDamage: 0, skillDamage: 0, statBased: 0, mastery: 0, critRate: 0, critDamage: 0, minDamage: 100, maxDamage: 100, finalDamage: 0, skillCoefficient: 100, accuracy: 100, attackInterval: 1, attackSpeed: 0 };

const rules = { caps: { defensePenetration: 1000, attackSpeed: 1500 } };

let r = calculateDamage(base, rules);
assert.equal(r.average, 1000, 'baseline damage should equal attack when every multiplier is neutral');
assert.equal(r.dps, 1000, 'baseline DPS should equal damage at one-second interval');

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

console.log('engine tests passed');
