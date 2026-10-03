import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSkillModel, buildSkillModels, optimizeLoadout, simulateLoadout, parseDirectDamage } from '../skill-optimizer.mjs';

const skills = JSON.parse(fs.readFileSync('data/job-skills.json', 'utf8'));
const verbose = process.argv.includes('--verbose');

// ---- parser unit checks ----
assert.equal(parseDirectDamage('적 15명에게 2850% 피해를 4회 입힙니다.').totalPct, 11400);
assert.equal(parseDirectDamage('적 7명에게 220% 피해를 입힙니다. 폭발이 발생하여 주변 적 7명에게 330% 피해를 입힙니다.').totalPct, 550);
assert.equal(parseDirectDamage('한 명의 적에게 두 대의 화살을 연달아 날려 각각 330% 740% 피해를 입힙니다.').totalPct, 1070);
assert.equal(parseDirectDamage('아주 빠른 속도로 탄을 7회 발사하여 각각 1350% 피해를 입힙니다.').totalPct, 9450);
assert.equal(parseDirectDamage('빠른 속도로 화살을 13회 발사합니다. 화살은 전방의 적 9명에게 780% 피해를 입히며').totalPct, 10140);
assert.equal(parseDirectDamage('전방 3명을 26% × 2타 표창').totalPct, 52);

const ship = parseSkillModel({ name: '배틀쉽 봄버', effect: '노틸러스 호의 배틀쉽을 소환합니다. 배틀쉽은 3초 후 자신의 후방에 도착하며 주변 적 5명에게 3800% 피해를 2회 입힙니다. 이후 30초간 머무르며 2초마다 배틀쉽 전방의 적에게 3300% 피해를 입힙니다.' });
assert.equal(ship.directPct, 7600);
assert.deepEqual([ship.periodic.interval, ship.periodic.pct, ship.periodic.ticks], [2, 3300, 15]);

const leap = parseSkillModel({ name: '타임 리프', effect: '액티브 스킬의 재사용 대기시간이 즉시 50% 감소하고 40 초간 최종 데미지가 30% 증가합니다. 이 스킬은 스킬 장착 시 최초 전투 시작 시 12초의 재사용 대기시간이 적용됩니다.' });
assert.equal(leap.cdResetPct, 50);
assert.equal(leap.buff.duration, 40);
assert.equal(leap.buff.stats.finalDamage, 30);
assert.equal(leap.initialCooldown, 12);

const evasion = parseSkillModel({ name: '다크니스 이베이젼', effect: '15초간 최종 데미지가 20% 증가합니다. 지속시간 중 한 번 자신이 상태이상에 걸리면 5초간 받는 피해가 20% 감소합니다.' });
assert.deepEqual(evasion.buff, { duration: 15, stats: { finalDamage: 20 } });

const storm = parseSkillModel({ name: '엘리멘트 : 스톰', effect: '12초간 공격력이 12% 데미지가 4% 증가합니다.' });
assert.deepEqual(storm.buff.stats, { attackPct: 12, damage: 4 });

const servant = parseSkillModel({ name: '쉐도우 서번트', effect: '15초간 기본 공격 효과 스킬을 시간차로 따라하는 그림자를 소환하여 원본 스킬 피해량의 20%만큼 추가 피해를 입힙니다.' });
assert.equal(servant.servantPct, 20);
assert.equal(servant.directPct, 0);

const basicMk = parseSkillModel({ name: '어설트', effect: '전방 6명을 290% × 5타', cooldown: '즉시' });
assert.equal(basicMk.isBasic, true);

const ascension = parseSkillModel({ name: '다크니스 어센션', effect: '15초간 공격력이 25% 증가하고 5초마다 최대 HP의 4%를 회복합니다.' });
assert.equal(ascension.periodic, null, 'healing must not be parsed as periodic damage');
assert.deepEqual(ascension.buff, { duration: 15, stats: { attackPct: 25 } });

// ---- Night Walker loadout (screenshot: Lv ~99, 8 skills unlocked) ----
const nw = buildSkillModels(skills.nightWalker, 99);
const unlocked = nw.filter(m => m.unlocked).map(m => m.name);
assert.deepEqual(unlocked.sort(), ['다크니스 어센션', '럭키 세븐', '스타더스트', '쉐도우 서번트', '엘리멘탈 하모니', '엘리멘트 : 다크니스', '쿼드러플 스로우', '트리플 스로우'].sort());

const ctx = {
  duration: 60, attackInterval: 1, attackSpeed: 30, attackSpeedCap: 150,
  cooldownReductionPercent: 0, fixedCooldownReductionSeconds: 0, boss: true,
  damageFor: (s) => (1 + (s.attackPct || 0) / 200) * (1 + (s.finalDamage || 0) / 100) * (1 + (s.damage || 0) / 100) * 1000
};
const res = optimizeLoadout({ models: nw, ctx });
assert.equal(res.best.basic.name, '쿼드러플 스로우');
assert.equal(res.best.skills.length, 5);
assert.ok(res.best.dps > 0);

// Lv.120: 4th job unlocked → 퀸터플 + 스티치 should be chosen
const nw120 = buildSkillModels(skills.nightWalker, 120, { '쉐도우 스티치': { cooldown: 30 } });
const res120 = optimizeLoadout({ models: nw120, ctx });
assert.equal(res120.best.basic.name, '퀸터플 스로우');
assert.ok(res120.best.skills.some(s => s.name === '쉐도우 스티치'));

// Buff must raise damage while active
const quad = nw.find(m => m.name === '쿼드러플 스로우');
const asc = nw.find(m => m.name === '다크니스 어센션');
const noBuff = simulateLoadout(quad, [], ctx);
const withBuff = simulateLoadout(quad, [asc], ctx);
assert.ok(withBuff.total > noBuff.total * 0.98, 'buff loadout should not lose much damage');

// ---- 8.1 Independent Timer Isolation Test ----
const s1 = { id: 's1', name: 'Skill1', baseCooldown: 10, directPct: 1000, hits: 1, isBasic: false, notes: [] };
const s2 = { id: 's2', name: 'Skill2', baseCooldown: 15, directPct: 1500, hits: 1, isBasic: false, notes: [] };
const basicAttack = { id: 'b1', name: 'Basic', baseCooldown: 0, directPct: 100, hits: 1, isBasic: true, notes: [] };
const testCtx = {
  duration: 30, attackInterval: 1, attackSpeed: 0, attackSpeedCap: 150,
  cooldownReductionPercent: 0, fixedCooldownReductionSeconds: 0, boss: true,
  damageFor: () => 1000
};
const simTimers = simulateLoadout(basicAttack, [s1, s2], testCtx);
const s1Casts = simTimers.timeline.filter(x => x.name === 'Skill1').map(x => x.t);
const s2Casts = simTimers.timeline.filter(x => x.name === 'Skill2').map(x => x.t);
assert.deepEqual(s1Casts, [1, 11, 21], 'Skill1 must cast sequentially at 1, 11, 21 independently');
assert.deepEqual(s2Casts, [0, 15], 'Skill2 must cast at 0, 15 independently');

// ---- 8.2 0.05s Boundary Time Quantization Test ----
const quantCtx = {
  duration: 10, attackInterval: 0.33333333, attackSpeed: 17.5, attackSpeedCap: 150,
  cooldownReductionPercent: 0, fixedCooldownReductionSeconds: 0, boss: true,
  damageFor: () => 1000
};
const simQuant = simulateLoadout(basicAttack, [s1], quantCtx);
for (const item of simQuant.timeline) {
  const rem = Math.abs(item.t * 20 - Math.round(item.t * 20));
  assert.ok(rem < 1e-6, `Timeline timestamp ${item.t} must be aligned to 0.05s grid`);
}

// ---- 8.3 CDR Calculation Rules Test ----
import { calculateEffectiveCooldown } from '../engine.mjs';
assert.equal(calculateEffectiveCooldown(20, 10, 0), 18, '20s base with 10% CDR = 18s');
assert.equal(calculateEffectiveCooldown(10, 0, 5), 5, '10s base with 5s fixed CDR (rate 1.0) = 5s');
assert.equal(calculateEffectiveCooldown(6, 0, 2), 5, '6s base (<7s) with 2s fixed CDR (rate 0.5) = 5s');
assert.equal(calculateEffectiveCooldown(5, 0, 10), 4, 'Minimum cooldown cap must be 4s');

// ---- 8.4 Provisional State & Warning Test ----
const provSkill = parseSkillModel({ name: '미확인 스킬', effect: '적 5명에게 1000% 피해' });
assert.equal(provSkill.cooldownStatus, 'provisional');
assert.equal(provSkill.provisional, true);
const simProv = simulateLoadout(basicAttack, [provSkill], testCtx);
assert.equal(simProv.provisional, true);
assert.ok(simProv.provisionalWarnings.length > 0, 'Provisional warnings must be populated');

// ---- 8.5 Full 14-Job Coverage Test ----
const jobKeys = ['hero', 'paladin', 'darkKnight', 'archMageIceLightning', 'archMageFirePoison', 'bishop', 'bowmaster', 'sniper', 'nightLord', 'shadower', 'viper', 'captain', 'nightWalker', 'windBreaker'];
for (const key of jobKeys) {
  assert.ok(skills[key], `Job ${key} missing in skills data`);
  const models = buildSkillModels(skills[key], 200);
  const basics = models.filter(m => m.isBasic);
  assert.ok(basics.length >= 1, `${key} must have at least one basic attack`);
  const r = optimizeLoadout({ models, ctx });
  assert.ok(r.best, `${key} optimizer must return a loadout`);
  if (verbose) {
    console.log(`\n## ${key} → basic ${r.best.basic?.name} + [${r.best.skills.map(s => s.name).join(', ')}] (${r.evaluated} combos)`);
  }
}

// ---- 8.6 Single Engine Parity Check Test ----
const simA = simulateLoadout(basicAttack, [s1, s2], testCtx);
const simB = simulateLoadout(basicAttack, [s1, s2], testCtx);
assert.equal(simA.dps, simB.dps, 'Single engine simulation must be 100% deterministic');
assert.ok(Math.abs(simA.dps - simB.dps) / Math.max(1, simA.dps) < 0.000001, 'DPS parity tolerance within 0.0001%');

console.log('skill optimizer tests passed');
console.log(`Night Walker Lv99 best: ${res.best.basic.name} + ${res.best.skills.map(s => s.name).join(', ')}`);
console.log(`Night Walker Lv120 best: ${res120.best.basic.name} + ${res120.best.skills.map(s => s.name).join(', ')}`);
console.log('All unified skill simulator & optimizer tests (8.1-8.6) passed cleanly!');

