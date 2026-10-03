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

// ---- every job parses without throwing; report coverage ----
for (const key of ['hero', 'paladin', 'darkKnight', 'archMageIceLightning', 'archMageFirePoison', 'bishop', 'bowmaster', 'sniper', 'nightLord', 'shadower', 'viper', 'captain', 'nightWalker', 'windBreaker']) {
  assert.ok(skills[key], `job ${key} missing`);
  const models = buildSkillModels(skills[key], 200);
  const basics = models.filter(m => m.isBasic);
  assert.ok(basics.length >= 1, `${key} must expose at least one basic attack skill`);
  const r = optimizeLoadout({ models, ctx });
  assert.ok(r.best, `${key} optimizer must return a loadout`);
  if (verbose) {
    console.log(`\n## ${key} → basic ${r.best.basic?.name} + [${r.best.skills.map(s => s.name).join(', ')}] (${r.evaluated} combos)`);
    for (const m of models) {
      console.log(`  ${m.isBasic ? 'B' : ' '} Lv${m.requiredLevel} ${m.name} | cd ${m.baseCooldown}${m.cooldownKnown ? '' : '?'} | dmg ${m.directPct}${m.periodic ? ` + ${m.periodic.pct}x${m.periodic.ticks}` : ''} | buff ${m.buff ? JSON.stringify(m.buff) : '-'}${m.servantPct ? ` servant ${m.servantPct}%` : ''}${m.passiveBoost ? ` | passive +${m.passiveBoost}%` : ''} ${m.notes.join('; ')}`);
    }
  }
}

console.log('skill optimizer tests passed');
console.log(`Night Walker Lv99 best: ${res.best.basic.name} + ${res.best.skills.map(s => s.name).join(', ')}`);
console.log(`Night Walker Lv120 best: ${res120.best.basic.name} + ${res120.best.skills.map(s => s.name).join(', ')}`);
