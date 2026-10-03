/**
 * Skill loadout optimizer: 1 basic-attack skill + up to 5 active skills.
 *
 * - parseSkillModel(): turns an official/Mekifun skill description into a numeric model
 *   (direct damage, periodic/summon damage, timed buffs, servant copy, cooldown reset).
 * - simulateLoadout(): time-stepped auto-battle simulation (skills auto-cast when ready,
 *   otherwise the basic attack is used; every action consumes one attack interval).
 * - optimizeLoadout(): exhaustive search over every legal (basic, 5 skills) combination.
 *
 * All damage values are routed through ctx.damageFor(buffStats, kind) so the caller can use
 * the official damage engine (calculateDamage) with the buffed stats.
 */
import { calculateEffectiveCooldown, diminishingSum } from './engine.mjs';

export const DEFAULT_UNKNOWN_COOLDOWN = 20;
export const LOADOUT_SKILL_SLOTS = 5;

const BASIC_MARKER = /\[\s*기본\s*공격\s*효과\s*\]/;
// Every job shares the same basic-attack ladder (1st→4th job).
const BASIC_LADDER = new Set(['26x2', '40x3', '80x5', '290x5']);
const num = v => parseFloat(String(v).replace(/,/g, ''));

function parseCooldown(text) {
  if (text === undefined || text === null) return null;
  const m = String(text).match(/([0-9.]+)\s*초/);
  return m ? num(m[1]) : null;
}

function firstDuration(text) {
  const m = String(text).match(/([0-9.]+)\s*초\s*(?:간|동안)/);
  return m ? num(m[1]) : null;
}

function durationBefore(text, index) {
  const re = /([0-9.]+)\s*초\s*(?:간|동안)/g;
  let m, last = null, first = null;
  while ((m = re.exec(text)) !== null) {
    if (first === null) first = num(m[1]);
    if (m.index < index) last = num(m[1]);
  }
  return last ?? first;
}

/** Extracts direct damage (sum of every "X% 피해 N회" chunk) from a description. */
export function parseDirectDamage(text) {
  let total = 0, hits = 0;
  const chunks = [];
  let rest = text;

  // "각각 330% 740% 피해"
  rest = rest.replace(/각각\s*((?:[0-9][0-9,.]*\s*%\s*)+)/g, (all, list) => {
    const values = [...list.matchAll(/([0-9][0-9,.]*)\s*%/g)].map(m => num(m[1]));
    // "탄을 7회 발사하여 각각 1350%" → repeat count applies to a single value
    const before = text.slice(0, text.indexOf(all));
    const shots = before.match(/(\d+)\s*회\s*발사/);
    if (values.length === 1 && shots) {
      total += values[0] * Number(shots[1]); hits += Number(shots[1]);
      chunks.push(`${values[0]}%×${shots[1]}`);
    } else {
      values.forEach(v => { total += v; hits += 1; chunks.push(`${v}%`); });
    }
    return ' ';
  });

  const re = /(\+\s*)?([0-9][0-9,.]*)\s*%\s*(?:의\s*)?(추가\s*피해|피해|×|x|로\s*(?:공격|타격|베기|강타))(?:를|을)?\s*(?:[×x]\s*)?(?:(\d+)\s*(?:회|타))?/g;
  let m;
  while ((m = re.exec(rest)) !== null) {
    if (m[1]) continue; // "+50%" conditional bonus
    const after = rest.slice(m.index + m[0].length, m.index + m[0].length + 4);
    if (/^\s*(?:증가|감소)/.test(after)) continue;
    const pct = num(m[2]);
    let count = m[4] ? Number(m[4]) : 1;
    // "화살을 13회 발사합니다. 화살은 ... 780% 피해"
    if (!m[4]) {
      const shots = rest.slice(0, m.index).match(/(\d+)\s*회\s*발사/);
      if (shots) count = Number(shots[1]);
    }
    total += pct * count; hits += count;
    chunks.push(`${pct}%×${count}`);
  }
  return { totalPct: total, hits, chunks };
}

function parseBuffStats(text) {
  const stats = {};
  const add = (key, re) => {
    const m = text.match(re);
    if (m) stats[key] = (stats[key] || 0) + num(m[1]);
  };
  if (!/만큼\s*최종/.test(text)) add('finalDamage', /최종\s*(?:데미지|뎀)(?:가|이)?\s*\+?\s*([0-9.]+)\s*%/);
  if (!/적\s*공격력/.test(text)) add('attackPct', /공격력(?:이|을|과\s*방어력(?:을|이)?)?\s*\+?\s*([0-9.]+)\s*%/);
  add('damage', /(?<!(?:최종|몬스터|공격|스킬|크리티컬|배율|최소|최대)\s?)데미지가\s*([0-9.]+)\s*%/);
  add('attackSpeed', /공격\s*속도(?:가|를)?\s*\+?\s*([0-9.]+)\s*%/);
  add('critDamage', /크리티컬\s*(?:데미지|뎀)(?:가|이)?\s*\+?\s*([0-9.]+)\s*%/);
  add('critRate', /크리티컬\s*확률(?:이)?\s*\+?\s*([0-9.]+)\s*%/);
  add('defPen', /방어\s*관통력이\s*([0-9.]+)\s*%/);
  add('targetTaken', /받는\s*피해(?:가|를)?\s*\+?\s*([0-9.]+)\s*%\s*(?:증가)?/);
  // "받는 피해 -8%" / "받는 피해가 20% 감소" are defensive, not offensive
  if (stats.targetTaken && /받는\s*피해(?:가|를)?\s*(?:-|[0-9.]+\s*%\s*감소)/.test(text)) delete stats.targetTaken;
  return stats;
}

/** Converts one skill entry into the numeric model used by the simulator. */
export function parseSkillModel(skill) {
  const effect = String(skill.effect || '');
  const notes = [];
  const model = {
    id: skill.id || skill.name,
    name: skill.name,
    effect,
    requiredLevel: Number(skill.requiredLevel) || 1,
    isBasic: false,
    baseCooldown: 0,
    cooldownKnown: true,
    initialCooldown: 0,
    directPct: 0,
    hits: 0,
    periodic: null,
    buff: null,
    servantPct: 0,
    cdResetPct: 0,
    bossExtraHits: 0,
    damageUnknown: false,
    notes
  };

  // ---- periodic / summon damage (removed from the text before direct parsing) ----
  let text = effect;
  const periodicRe = /([0-9.]+)\s*초마다[^%.]*?(?<!의\s?)([0-9][0-9,.]*)\s*%\s*(?:의\s*)?(?:지속\s*)?(?:추가\s*)?(?:피해)?(?:를)?\s*(?:[×x]\s*)?(?:(\d+)\s*(?:회|타))?|초당\s*([0-9][0-9,.]*)\s*%/g;
  const pm = [...text.matchAll(periodicRe)].find(m => {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 6);
    return !/회복|만큼/.test(after) && !/HP|MP/.test(m[0]);
  });
  if (pm) {
    const interval = pm[4] ? 1 : num(pm[1]);
    const pct = num(pm[4] || pm[2]);
    const hitsPerTick = pm[3] ? Number(pm[3]) : 1;
    const proc = /확률/.test(text.slice(0, pm.index));
    const dur = proc ? firstDuration(text) : durationBefore(text, pm.index);
    if (dur && interval > 0) {
      // "이후 30초간 머무르며 2초마다" → first tick after one interval
      model.periodic = { interval, pct: pct * hitsPerTick, duration: dur, ticks: Math.floor(dur / interval + 1e-9) };
      if (proc) notes.push('확률 발동 지속 피해를 상시 발동으로 근사');
    }
    text = text.replace(pm[0], ' ');
  }

  const direct = parseDirectDamage(text);
  model.directPct = direct.totalPct;
  model.hits = direct.hits;
  const bossExtra = effect.match(/보스라면\s*동일한\s*피해를\s*(\d+)\s*회\s*더/);
  if (bossExtra && direct.hits) model.bossExtraHits = Number(bossExtra[1]);

  // ---- basic attack detection ----
  const cd = parseCooldown(skill.cooldown);
  const first = direct.chunks[0]?.match(/([0-9.]+)%×(\d+)/);
  const ladderKey = first ? `${num(first[1])}x${first[2]}` : '';
  model.isBasic = BASIC_MARKER.test(effect) || (!cd && direct.chunks.length === 1 && BASIC_LADDER.has(ladderKey));

  // ---- cooldown ----
  if (model.isBasic) {
    model.baseCooldown = 0;
  } else if (cd) {
    model.baseCooldown = cd;
  } else {
    model.baseCooldown = DEFAULT_UNKNOWN_COOLDOWN;
    model.cooldownKnown = false;
    notes.push(`쿨타임 미확인 → ${DEFAULT_UNKNOWN_COOLDOWN}초 가정`);
  }
  const init = effect.match(/최초\s*전투\s*시작\s*시\s*([0-9.]+)\s*초/);
  if (init) model.initialCooldown = num(init[1]);

  // ---- timed buffs ----
  const buffStats = parseBuffStats(effect);
  if (Object.keys(buffStats).length) {
    const dur = firstDuration(effect);
    model.buff = { duration: dur || 0, stats: buffStats };
    if (!dur) notes.push('버프 지속시간 미확인');
  }
  const servant = effect.match(/원본\s*스킬\s*피해량의\s*([0-9.]+)\s*%/);
  if (servant) {
    model.servantPct = num(servant[1]);
    model.buff = model.buff || { duration: firstDuration(effect) || 0, stats: {} };
  }
  const reset = effect.match(/재사용\s*대기시간이\s*즉시\s*([0-9.]+)\s*%\s*감소/);
  if (reset) model.cdResetPct = num(reset[1]);
  if (/중첩/.test(effect) && model.buff) notes.push('중첩 증가분 미반영');

  if (!model.isBasic && !model.directPct && !model.periodic && !model.buff && !model.cdResetPct) {
    model.damageUnknown = /소환|피해|공격/.test(effect);
    if (model.damageUnknown) notes.push('피해 계수 미확인 → 직접 입력 필요');
  }
  return model;
}

/** Skill-specific final-damage passives ("다음 스킬들의 최종 데미지가 증가합니다. A 40%, B 100%"). */
export function parsePassiveSkillBoosts(passives = [], level = Infinity) {
  const boosts = {};
  const extras = {};
  for (const p of passives) {
    if ((Number(p.requiredLevel) || 0) > level) continue;
    const text = String(p.effect || '');
    const list = text.match(/다음\s*스킬들의\s*최종\s*데미지가\s*증가합니다\.?\s*(.+)$/);
    if (list) {
      for (const m of list[1].matchAll(/([가-힣A-Za-z :]+?)\s*([0-9.]+)\s*%/g)) {
        const name = m[1].replace(/^[,\s]+/, '').trim();
        boosts[name] = (boosts[name] || 0) + num(m[2]);
      }
      continue;
    }
    const single = text.match(/^([가-힣A-Za-z :]+?)(?:의)?\s*최종\s*데미지가\s*([0-9.]+)\s*%\s*증가/);
    if (single) boosts[single[1].trim()] = (boosts[single[1].trim()] || 0) + num(single[2]);
    const proc = text.match(/^([가-힣A-Za-z :]+?)\s*발동\s*시[^%]*?([0-9][0-9,.]*)\s*%\s*추가\s*피해를\s*(\d+)\s*회/);
    if (proc) extras[proc[1].trim()] = (extras[proc[1].trim()] || 0) + num(proc[2]) * Number(proc[3]);
  }
  return { boosts, extras };
}

function sumStats(list) {
  const out = {};
  for (const s of list) for (const [k, v] of Object.entries(s || {})) out[k] = (out[k] || 0) + v;
  return out;
}

/**
 * ctx = {
 *   duration, attackInterval, attackSpeed, attackSpeedCap,
 *   cooldownReductionPercent, fixedCooldownReductionSeconds, boss,
 *   damageFor(buffStats, kind) -> damage of a 100% hit
 * }
 */
export function simulateLoadout(basic, skills, ctx) {
  const duration = Math.max(1, Number(ctx.duration) || 60);
  const baseInterval = Math.max(0.05, Number(ctx.attackInterval) || 1);
  const speedCap = Number(ctx.attackSpeedCap) || 150;
  const cache = new Map();
  const per100 = (stats, kind) => {
    const key = kind + JSON.stringify(stats);
    if (!cache.has(key)) cache.set(key, Math.max(0, Number(ctx.damageFor(stats, kind)) || 0));
    return cache.get(key);
  };
  const effCd = s => s.baseCooldown > 0
    ? calculateEffectiveCooldown(s.baseCooldown, ctx.cooldownReductionPercent, ctx.fixedCooldownReductionSeconds)
    : 0;

  const readyAt = new Map(skills.map(s => [s.id, s.initialCooldown || 0]));
  const buffs = [];
  const usage = new Map();
  const track = (name, dmg, hits, casts = 0) => {
    const u = usage.get(name) || { name, damage: 0, hits: 0, casts: 0 };
    u.damage += dmg; u.hits += hits; u.casts += casts;
    usage.set(name, u);
  };
  const expected = s => (s.directPct + (s.periodic ? s.periodic.pct * s.periodic.ticks : 0));
  const priority = [...skills].sort((a, b) => {
    const ab = a.buff || a.cdResetPct ? 1 : 0, bb = b.buff || b.cdResetPct ? 1 : 0;
    return bb - ab || expected(b) - expected(a);
  });

  let t = 0, total = 0, actions = 0;
  const timeline = [];
  while (t < duration - 1e-9) {
    const live = buffs.filter(b => b.until > t + 1e-9);
    const stats = sumStats(live.map(b => b.stats));
    const servant = live.reduce((sum, b) => sum + (b.servantPct || 0), 0);
    const speed = diminishingSum(ctx.attackSpeed, live.map(b => b.stats.attackSpeed || 0).filter(Boolean), speedCap);
    const interval = baseInterval / (1 + speed / 100);
    const { attackSpeed, ...dmgStats } = stats;

    const cast = priority.find(s => readyAt.get(s.id) <= t + 1e-9);
    if (cast) {
      const cd = effCd(cast);
      readyAt.set(cast.id, t + (cd || duration * 10));
      if (cast.cdResetPct) {
        for (const s of skills) if (s !== cast) {
          const left = readyAt.get(s.id) - t;
          if (left > 0) readyAt.set(s.id, t + left * (1 - cast.cdResetPct / 100));
        }
      }
      if (cast.buff && cast.buff.duration > 0) {
        buffs.push({ id: cast.id, until: t + cast.buff.duration, stats: cast.buff.stats, servantPct: cast.servantPct });
      }
      const nowStats = cast.buff ? sumStats([dmgStats, Object.fromEntries(Object.entries(cast.buff.stats).filter(([k]) => k !== 'attackSpeed'))]) : dmgStats;
      const mult = 1 + (cast.passiveBoost || 0) / 100;
      const hitsTotal = cast.hits + (ctx.boss ? cast.bossExtraHits : 0);
      const pct = (cast.directPct + (ctx.boss && cast.hits ? cast.directPct / cast.hits * cast.bossExtraHits : 0)) * mult + (cast.passiveExtraPct || 0);
      let dmg = pct / 100 * per100(nowStats, 'skill');
      let hits = hitsTotal;
      if (cast.periodic) {
        const ticks = Math.min(cast.periodic.ticks, Math.floor((duration - t) / cast.periodic.interval + 1e-9));
        dmg += ticks * cast.periodic.pct * mult / 100 * per100(nowStats, 'skill');
        hits += ticks;
      }
      total += dmg;
      track(cast.name, dmg, hits, 1);
      timeline.push({ t, name: cast.name });
    } else if (basic) {
      const d = basic.directPct / 100 * per100(dmgStats, 'basic') * (1 + (basic.passiveBoost || 0) / 100);
      total += d;
      track(basic.name, d, basic.hits, 1);
      if (servant > 0) {
        const s = d * servant / 100;
        total += s;
        track('그림자 추가타', s, basic.hits, 0);
      }
    }
    actions++;
    t += interval;
  }
  return {
    total,
    dps: total / duration,
    duration,
    actions,
    usage: [...usage.values()].sort((a, b) => b.damage - a.damage),
    timeline,
    castOrder: priority.map(s => s.name)
  };
}

function combinations(list, k, start = 0, picked = [], out = []) {
  if (picked.length === k) { out.push([...picked]); return out; }
  for (let i = start; i <= list.length - (k - picked.length); i++) {
    picked.push(list[i]);
    combinations(list, k, i + 1, picked, out);
    picked.pop();
  }
  return out;
}

/** Builds the skill models available for a job at a level (with overrides & passive boosts). */
export function buildSkillModels(jobData, level = Infinity, overrides = {}) {
  const actives = (jobData?.stages || []).flatMap(st => st.active || []);
  const passives = (jobData?.stages || []).flatMap(st => [...(st.passive || []), ...(st.masteries || [])]);
  const { boosts, extras } = parsePassiveSkillBoosts(passives, level);
  const seen = new Set();
  const models = [];
  for (const sk of actives) {
    if (seen.has(sk.name)) continue; // e.g. 전함 노틸러스 listed twice
    seen.add(sk.name);
    const m = parseSkillModel(sk);
    m.unlocked = m.requiredLevel <= level;
    m.passiveBoost = boosts[m.name] || 0;
    m.passiveExtraPct = extras[m.name] || 0;
    const o = overrides[m.name] || {};
    if (Number(o.cooldown) > 0 && !m.isBasic) {
      m.baseCooldown = Number(o.cooldown); m.cooldownKnown = true;
      m.notes = m.notes.filter(n => !n.startsWith('쿨타임 미확인'));
      m.overridden = true;
    }
    if (o.coef !== undefined && o.coef !== '' && Number(o.coef) >= 0) {
      m.directPct = Number(o.coef); m.hits = m.hits || 1; m.periodic = o.keepPeriodic ? m.periodic : null;
      m.damageUnknown = false;
      m.notes = m.notes.filter(n => !n.startsWith('피해 계수 미확인'));
      m.overridden = true;
    }
    models.push(m);
  }
  return models;
}

export function optimizeLoadout({ models, ctx, slots = LOADOUT_SKILL_SLOTS, top = 5, locked = [] }) {
  const usable = models.filter(m => m.unlocked !== false);
  const basics = usable.filter(m => m.isBasic);
  const others = usable.filter(m => !m.isBasic);
  const lockedSet = new Set(locked);
  const fixed = others.filter(m => lockedSet.has(m.name));
  const free = others.filter(m => !lockedSet.has(m.name));
  const k = Math.max(0, Math.min(slots, others.length) - fixed.length);
  const combos = combinations(free, Math.min(k, free.length));
  const basicCandidates = basics.length ? basics : [null];
  const ranking = [];
  for (const basic of basicCandidates) {
    for (const combo of combos) {
      const set = [...fixed, ...combo];
      const sim = simulateLoadout(basic, set, ctx);
      ranking.push({ basic, skills: set, ...sim });
    }
  }
  ranking.sort((a, b) => b.total - a.total);
  return {
    best: ranking[0] || null,
    ranking: ranking.slice(0, top),
    evaluated: ranking.length,
    basics,
    others
  };
}
