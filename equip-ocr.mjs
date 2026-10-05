/**
 * MapleStory Idle - Equipment Screenshot OCR & Slot Matcher Engine
 */

export const SLOT_DEFINITIONS = [
  { id: 'hat', name: '모자', slotType: 'armor', keywords: [/모자/, /투구/, /헬멧/, /머리/] },
  { id: 'top', name: '상의', slotType: 'armor', keywords: [/상의/, /갑옷/, /셔츠/, /옷/] },
  { id: 'bottom', name: '하의', slotType: 'armor', keywords: [/하의/, /바지/, /팬츠/] },
  { id: 'glove', name: '장갑', slotType: 'glove', keywords: [/장갑/, /글러브/, /건틀렛/] },
  { id: 'shoes', name: '신발', slotType: 'armor', keywords: [/신발/, /부츠/, /슈즈/] },
  { id: 'cape', name: '망토', slotType: 'armor', keywords: [/망토/, /케이프/, /클록/] },
  { id: 'shoulder', name: '어깨장식', slotType: 'accessory', keywords: [/어깨/, /견장/, /숄더/] },
  { id: 'belt', name: '벨트', slotType: 'accessory', keywords: [/벨트/, /띠/] },
  { id: 'necklace', name: '목걸이', slotType: 'accessory', keywords: [/목걸이/, /팬던트/, /펜던트/, /네클리스/] },
  { id: 'earring', name: '귀고리', slotType: 'accessory', keywords: [/귀고리/, /이어링/, /귀걸이/] },
  { id: 'ring1', name: '반지', slotType: 'accessory', keywords: [/반지/, /링/] },
  { id: 'eye', name: '눈 장식', slotType: 'accessory', keywords: [/눈\s*장식/, /안경/, /글래스/] },
  { id: 'face', name: '얼굴 장식', slotType: 'accessory', keywords: [/얼굴\s*장식/, /마스크/, /페이셜/] },
  { id: 'pocket', name: '포켓', slotType: 'accessory', keywords: [/포켓/, /주머니/, /포켓아이템/] }
];

export const GRADE_MAP = {
  '노말': 'normal',
  'normal': 'normal',
  '레어': 'rare',
  'rare': 'rare',
  '에픽': 'epic',
  'epic': 'epic',
  '유니크': 'unique',
  'unique': 'unique',
  '레전더리': 'legendary',
  'legendary': 'legendary',
  '미스틱': 'mystic',
  'mystic': 'mystic'
};

export const GRADE_KOREAN = {
  normal: '노말',
  rare: '레어',
  epic: '에픽',
  unique: '유니크',
  legendary: '레전더리',
  mystic: '미스틱'
};

export const GRADE_POTENTIAL_SPECS = {
  normal: {
    slots: {
      1: { statPct: [3], damage: [5], minDamage: [3], maxDamage: [3], critRate: [3], maxHpPct: [6], maxMpPct: [3], defPct: [3], attackSpeed: [3], statFlat: [50] },
      2: { statPct: [3], damage: [5], minDamage: [3], maxDamage: [3], critRate: [3], maxHpPct: [6], maxMpPct: [3], defPct: [3], attackSpeed: [3], statFlat: [50] },
      3: { statPct: [3], damage: [5], minDamage: [3], maxDamage: [3], critRate: [3], maxHpPct: [6], maxMpPct: [3], defPct: [3], attackSpeed: [3], statFlat: [50] }
    }
  },
  rare: {
    slots: {
      1: { statPct: [4.5], damage: [8], minDamage: [6], maxDamage: [6], critRate: [4.5], maxHpPct: [9], maxMpPct: [4.5], defPct: [4.5], attackSpeed: [3.5], statFlat: [100] },
      2: { statPct: [3, 4.5], damage: [5, 8], minDamage: [3, 6], maxDamage: [3, 6], critRate: [3, 4.5], maxHpPct: [6, 9], maxMpPct: [3, 4.5], defPct: [3, 4.5], attackSpeed: [3, 3.5], statFlat: [50, 100] },
      3: { statPct: [3, 4.5], damage: [5, 8], minDamage: [3, 6], maxDamage: [3, 6], critRate: [3, 4.5], maxHpPct: [6, 9], maxMpPct: [3, 4.5], defPct: [3, 4.5], attackSpeed: [3, 3.5], statFlat: [50, 100] }
    }
  },
  epic: {
    slots: {
      1: { statPct: [6], damage: [12], minDamage: [8], maxDamage: [8], critRate: [6], maxHpPct: [12], maxMpPct: [6], defPct: [6], attackSpeed: [4], statFlat: [200], cooldownReduction: [0.5], critDamage: [10], attackPct: [6], bossDamage: [6], finalDamage: [3], skillDmg: [8], atkBasicDmg: [8] },
      2: { statPct: [4.5, 6], damage: [8, 12], minDamage: [6, 8], maxDamage: [6, 8], critRate: [4.5, 6], maxHpPct: [9, 12], maxMpPct: [4.5, 6], defPct: [4.5, 6], attackSpeed: [3.5, 4], statFlat: [100, 200], cooldownReduction: [0.5], critDamage: [10], attackPct: [4.5, 6], bossDamage: [6], finalDamage: [3], skillDmg: [8], atkBasicDmg: [8] },
      3: { statPct: [4.5, 6], damage: [8, 12], minDamage: [6, 8], maxDamage: [6, 8], critRate: [4.5, 6], maxHpPct: [9, 12], maxMpPct: [4.5, 6], defPct: [4.5, 6], attackSpeed: [3.5, 4], statFlat: [100, 200], cooldownReduction: [0.5], critDamage: [10], attackPct: [4.5, 6], bossDamage: [6], finalDamage: [3], skillDmg: [8], atkBasicDmg: [8] }
    }
  },
  unique: {
    slots: {
      1: { statPct: [9], damage: [18], minDamage: [10], maxDamage: [10], critRate: [9], maxHpPct: [15], maxMpPct: [9], defPct: [9], attackSpeed: [5], statFlat: [400], cooldownReduction: [1], critDamage: [20], attackPct: [9], bossDamage: [12], defPen: [8], finalDamage: [5], skillDmg: [14], atkBasicDmg: [14] },
      2: { statPct: [6, 9], damage: [12, 18], minDamage: [8, 10], maxDamage: [8, 10], critRate: [6, 9], maxHpPct: [12, 15], maxMpPct: [6, 9], defPct: [6, 9], attackSpeed: [4, 5], statFlat: [200, 400], cooldownReduction: [0.5, 1], critDamage: [10, 20], attackPct: [6, 9], bossDamage: [6, 12], defPen: [8], finalDamage: [3, 5], skillDmg: [8, 14], atkBasicDmg: [8, 14] },
      3: { statPct: [6, 9], damage: [12, 18], minDamage: [8, 10], maxDamage: [8, 10], critRate: [6, 9], maxHpPct: [12, 15], maxMpPct: [6, 9], defPct: [6, 9], attackSpeed: [4, 5], statFlat: [200, 400], cooldownReduction: [0.5, 1], critDamage: [10, 20], attackPct: [6, 9], bossDamage: [6, 12], defPen: [8], finalDamage: [3, 5], skillDmg: [8, 14], atkBasicDmg: [8, 14] }
    }
  },
  legendary: {
    slots: {
      1: { statPct: [12], damage: [25], minDamage: [15], maxDamage: [15], critRate: [12], maxHpPct: [20], maxMpPct: [12], defPct: [12], attackSpeed: [7], statFlat: [600], cooldownReduction: [1.5], critDamage: [30], attackPct: [12], bossDamage: [18], defPen: [12], finalDamage: [8] },
      2: { statPct: [9, 12], damage: [18, 25], minDamage: [10, 15], maxDamage: [10, 15], critRate: [9, 12], maxHpPct: [15, 20], maxMpPct: [9, 12], defPct: [9, 12], attackSpeed: [5, 7], statFlat: [400, 600], cooldownReduction: [1, 1.5], critDamage: [20, 30], attackPct: [9, 12], bossDamage: [12, 18], defPen: [8, 12], finalDamage: [5, 8] },
      3: { statPct: [9, 12], damage: [18, 25], minDamage: [10, 15], maxDamage: [10, 15], critRate: [9, 12], maxHpPct: [15, 20], maxMpPct: [9, 12], defPct: [9, 12], attackSpeed: [5, 7], statFlat: [400, 600], cooldownReduction: [1, 1.5], critDamage: [20, 30], attackPct: [9, 12], bossDamage: [12, 18], defPen: [8, 12], finalDamage: [5, 8] }
    }
  },
  mystic: {
    slots: {
      1: { statPct: [15], damage: [35], minDamage: [25], maxDamage: [25], critRate: [15], maxHpPct: [25], maxMpPct: [15], defPct: [15], attackSpeed: [10], statFlat: [1000], cooldownReduction: [2], critDamage: [50], attackPct: [15], bossDamage: [24], defPen: [20], finalDamage: [12], skillDmg: [30], atkBasicDmg: [30] },
      2: { statPct: [12, 15], damage: [25, 35], minDamage: [15, 25], maxDamage: [15, 25], critRate: [12, 15], maxHpPct: [20, 25], maxMpPct: [12, 15], defPct: [12, 15], attackSpeed: [7, 10], statFlat: [600, 1000], cooldownReduction: [1.5, 2], critDamage: [30, 50], attackPct: [12, 15], bossDamage: [18, 24], defPen: [12, 20], finalDamage: [8, 12], skillDmg: [21, 30], atkBasicDmg: [21, 30] },
      3: { statPct: [12, 15], damage: [25, 35], minDamage: [15, 25], maxDamage: [15, 25], critRate: [12, 15], maxHpPct: [20, 25], maxMpPct: [12, 15], defPct: [12, 15], attackSpeed: [7, 10], statFlat: [600, 1000], cooldownReduction: [1.5, 2], critDamage: [30, 50], attackPct: [12, 15], bossDamage: [18, 24], defPen: [12, 20], finalDamage: [8, 12], skillDmg: [21, 30], atkBasicDmg: [21, 30] }
    }
  }
};

/**
 * Maps potential option text to engine stat key
 */
export function parsePotentialLine(line, jobMainStat = 'LUK', jobSubStat = null, grade = null, slotIndex = null) {
  if (!line || typeof line !== 'string') return { stat: 'NONE', value: 0 };
  const trimmed = line.trim();

  const normalizedGrade = grade ? (GRADE_MAP[grade] || grade) : null;
  const slotIdx = Math.min(3, Math.max(1, Number(slotIndex) || 1));

  function resolveValue(statKey, extractedNum, defaultVal) {
    if (!normalizedGrade || !GRADE_POTENTIAL_SPECS[normalizedGrade]) {
      return (extractedNum != null && !isNaN(extractedNum) && extractedNum > 0) ? extractedNum : defaultVal;
    }
    const allowed = GRADE_POTENTIAL_SPECS[normalizedGrade]?.slots?.[slotIdx]?.[statKey] || [];
    if (!allowed.length) {
      return (extractedNum != null && !isNaN(extractedNum) && extractedNum > 0) ? extractedNum : defaultVal;
    }
    if (extractedNum != null && !isNaN(extractedNum) && extractedNum > 0) {
      let best = allowed[0];
      let minDiff = Math.abs(extractedNum - best);
      for (const v of allowed) {
        const diff = Math.abs(extractedNum - v);
        if (diff < minDiff) {
          minDiff = diff;
          best = v;
        }
      }
      return best;
    }
    return slotIdx === 1 ? allowed[allowed.length - 1] : allowed[0];
  }

  // Guard against decimal percentages (Cube potentials NEVER have decimals; decimals like 5.7% or 6.2% are base/equipped stats)
  if (/\b\d+\.\d+\s*%/.test(trimmed)) {
    return { stat: 'NONE', value: 0, raw: trimmed, display: '잡옵' };
  }

  // 1. Min / Max Damage Ratio (최소 데미지 배율, 최대 데미지 배율)
  if (/(?:최소\s*데미지\s*배율|최소\s*데미지|최소뎀)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('minDamage', rawNum, 8);
    return { stat: 'minDamage', value: val, raw: trimmed, display: `최소뎀 ${val}%` };
  }

  if (/(?:최대\s*데미지\s*배율|최대\s*데미지|최대뎀)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('maxDamage', rawNum, 8);
    return { stat: 'maxDamage', value: val, raw: trimmed, display: `최대뎀 ${val}%` };
  }

  // 1.5 Final Damage (최종 데미지)
  if (/(?:최종\s*데미지|최종뎀)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('finalDamage', rawNum, 5);
    return { stat: 'finalDamage', value: val, raw: trimmed, display: `최종뎀 ${val}%` };
  }

  // 1.6 Skill / Basic Attack Damage (스킬 데미지, 기본 공격 데미지)
  if (/(?:스킬\s*데미지|스킬뎀)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('skillDmg', rawNum, 14);
    return { stat: 'skillDmg', value: val, raw: trimmed, display: `스킬뎀 ${val}%` };
  }

  if (/(?:기본\s*공격\s*데미지|기공뎀|평타\s*데미지)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('atkBasicDmg', rawNum, 14);
    return { stat: 'atkBasicDmg', value: val, raw: trimmed, display: `기공뎀 ${val}%` };
  }

  // 2. HP% (최대 HP, HP, 최대 1P, 최대 IP etc.)
  const hpMatch = trimmed.match(/(?:최대\s*HP|최대\s*1[0-9]|최대\s*IP|HP)\s*([0-9.]*)\s*%?/i);
  if (hpMatch && !/공격력|데미지|대미지|더미지|크리티컬|배율/.test(trimmed)) {
    const rawVal = hpMatch[1] ? Number(hpMatch[1]) : null;
    const val = resolveValue('maxHpPct', rawVal, 15);
    return { stat: 'maxHpPct', value: val, raw: trimmed, display: `HP ${val}%` };
  }

  // 3. Specific Stat Names (STR, DEX, INT, LUK, 주스탯, 부스탯, 올스탯)
  const statMatch = trimmed.match(/(?:^|[\s|:·•\-])(STR|DEX|PEX|INT|LUK|주스탯|부스탯|올스탯)\s*([0-9.]*)\s*(?:%|[×xX]|o\/o|\/o)?/i);
  if (statMatch) {
    let statName = statMatch[1].toUpperCase();
    if (statName === 'PEX') statName = 'DEX';
    const rawNum = statMatch[2] ? Number(statMatch[2]) : null;
    const normalizedMain = (jobMainStat || 'LUK').toUpperCase();
    const subStatMap = { 'LUK': 'DEX', 'STR': 'DEX', 'DEX': 'STR', 'INT': 'LUK' };
    const normalizedSub = (jobSubStat || subStatMap[normalizedMain] || 'DEX').toUpperCase();

    // Check if flat stat (e.g. 50, 100, 200, 400, 600, 1000)
    if (rawNum != null && rawNum >= 50 && !trimmed.includes('%')) {
      const flatVal = resolveValue('statFlat', rawNum, 200);
      if (statName === '올스탯') return { stat: 'allStat', value: flatVal, raw: trimmed, display: `올스탯(+) ${flatVal}` };
      if (statName === '주스탯' || statName === normalizedMain) return { stat: 'mainStat', value: flatVal, raw: trimmed, display: `${statName}(+) ${flatVal}` };
      if (statName === '부스탯' || statName === normalizedSub) return { stat: 'subStat', value: flatVal, raw: trimmed, display: `${statName}(+) ${flatVal}` };
      return { stat: 'NONE', value: 0, raw: trimmed, display: `${statName}(+) ${flatVal} (잡옵)` };
    }

    const pctVal = resolveValue('statPct', rawNum, 9);
    if (statName === '올스탯') {
      return { stat: 'allStatPct', value: pctVal, raw: trimmed, display: `올스탯 ${pctVal}%` };
    }
    if (statName === '주스탯' || statName === normalizedMain) {
      return { stat: 'mainStatPct', value: pctVal, raw: trimmed, display: `${statName} ${pctVal}%` };
    }
    if (statName === '부스탯' || statName === normalizedSub) {
      return { stat: 'subStatPct', value: pctVal, raw: trimmed, display: `${statName} ${pctVal}%` };
    }
    return { stat: 'NONE', value: 0, raw: trimmed, display: `${statName} ${pctVal}% (잡옵)` };
  }

  // 4. Combat Stats with Fuzzy Keyword & Grade Value Matching
  // A. General Damage (데미지, 대미지, 더미지, 도미지, 태미지, som, dam, dmg, 뎀)
  if (/(?:데미지|대미지|더미지|도미지|태미지|som|dam|dmg|뎀)/i.test(trimmed) && !/보스|크리티컬|최소|최대|최종|스킬|기본/.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('damage', rawNum, 12);
    return { stat: 'damage', value: val, raw: trimmed, display: `데미지 ${val}%` };
  }

  // B. Critical Rate (크리티컬 확률, 크확, 크리티컬)
  if (/(?:크리티컬\s*확률|크확)/i.test(trimmed) || (/크리티컬/i.test(trimmed) && !/데미지|대미지|크뎀/.test(trimmed))) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('critRate', rawNum, 6);
    return { stat: 'critRate', value: val, raw: trimmed, display: `크확 ${val}%` };
  }

  // C. Critical Damage (크리티컬 데미지, 크뎀)
  if (/(?:크리티컬\s*데미지|크뎀)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('critDamage', rawNum, 10);
    return { stat: 'critDamage', value: val, raw: trimmed, display: `크뎀 ${val}%` };
  }

  // D. Cooldown Reduction (스킬 재사용 대기시간 감소, 쿨감, 재사용 대기시간)
  if (/(?:스킬\s*재사용|재사용\s*대기시간|대기시간\s*감소|쿨감)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('cooldownReduction', rawNum, 1);
    return { stat: 'cooldownReduction', value: val, raw: trimmed, display: `쿨감 ${val}초` };
  }

  // E. Boss Damage (보스 몬스터 공격 시 데미지, 보스 데미지, 보공)
  if (/(?:보스\s*몬스터\s*공격\s*시\s*데미지|보스\s*데미지|보공)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('bossDamage', rawNum, 12);
    return { stat: 'bossDamage', value: val, raw: trimmed, display: `보공 ${val}%` };
  }

  // F. Attack Speed (공격 속도, 공속)
  if (/(?:공격\s*속도|공속)\s*([0-9.]*)\s*%?/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('attackSpeed', rawNum, 5);
    return { stat: 'attackSpeed', value: val, raw: trimmed, display: `공속 ${val}%` };
  }

  // G. Attack % (공격력 %, 마력 %)
  if (/(?:공격력|마력)\s*([0-9.]*)\s*%/i.test(trimmed)) {
    const numMatch = trimmed.match(/(?:공격력|마력)\s*([0-9.]*)\s*%/i);
    const rawNum = numMatch && numMatch[1] ? Number(numMatch[1]) : null;
    const val = resolveValue('attackPct', rawNum, 9);
    return { stat: 'attackPct', value: val, raw: trimmed, display: `공 ${val}%` };
  }

  // H. Def Pen (방어율 무시, 방어력 관통, 방관, 방무)
  if (/(?:방어율\s*무시|방어력\s*관통|방관|방무)\s*([0-9.]*)\s*%?/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('defPen', rawNum, 8);
    return { stat: 'defPen', value: val, raw: trimmed, display: `방관 ${val}%` };
  }

  // I. Def % (방어력 %)
  if (/방어력\s*([0-9.]*)\s*%/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('defPct', rawNum, 9);
    return { stat: 'defPct', value: val, raw: trimmed, display: `방어 ${val}%` };
  }

  // J. Max MP % (최대 MP %)
  if (/(?:최대\s*MP|MP)\s*([0-9.]*)\s*%/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('maxMpPct', rawNum, 9);
    return { stat: 'maxMpPct', value: val, raw: trimmed, display: `MP ${val}%` };
  }

  // B. Critical Rate (크리티컬 확률, 크확, 크리티컬)
  if (/(?:크리티컬\s*확률|크확)/i.test(trimmed) || (/크리티컬/i.test(trimmed) && !/데미지|대미지|크뎀/.test(trimmed))) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('critRate', rawNum, 6);
    return { stat: 'critRate', value: val, raw: trimmed, display: `크확 ${val}%` };
  }

  // C. Critical Damage (크리티컬 데미지, 크뎀)
  if (/(?:크리티컬\s*데미지|크뎀)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('critDamage', rawNum, 10);
    return { stat: 'critDamage', value: val, raw: trimmed, display: `크뎀 ${val}%` };
  }

  // D. Cooldown Reduction (스킬 재사용 대기시간 감소, 쿨감, 재사용 대기시간)
  if (/(?:스킬\s*재사용|재사용\s*대기시간|대기시간\s*감소|쿨감)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('cooldownReduction', rawNum, 1);
    return { stat: 'cooldownReduction', value: val, raw: trimmed, display: `쿨감 ${val}초` };
  }

  // E. Boss Damage (보스 몬스터 공격 시 데미지, 보스 데미지, 보공)
  if (/(?:보스\s*몬스터\s*공격\s*시\s*데미지|보스\s*데미지|보공)/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('bossDamage', rawNum, 12);
    return { stat: 'bossDamage', value: val, raw: trimmed, display: `보공 ${val}%` };
  }

  // F. Attack % (공격력 %, 마력 %)
  if (/(?:공격력|마력)\s*([0-9.]*)\s*%/i.test(trimmed)) {
    const numMatch = trimmed.match(/(?:공격력|마력)\s*([0-9.]*)\s*%/i);
    const rawNum = numMatch && numMatch[1] ? Number(numMatch[1]) : null;
    const val = resolveValue('attackPct', rawNum, 9);
    return { stat: 'attackPct', value: val, raw: trimmed, display: `공 ${val}%` };
  }

  // G. Def Pen (방어율 무시, 방어력 관통, 방관, 방무)
  if (/(?:방어율\s*무시|방어력\s*관통|방관|방무)\s*([0-9.]*)\s*%?/i.test(trimmed)) {
    const numMatch = trimmed.match(/([0-9.]+)/);
    const rawNum = numMatch ? Number(numMatch[1]) : null;
    const val = resolveValue('defPen', rawNum, 8);
    return { stat: 'defPen', value: val, raw: trimmed, display: `방관 ${val}%` };
  }

  // 4. Flat Stats Fallback
  if (!trimmed.includes('%')) {
    const flatPatterns = [
      { stat: 'attackFlat', re: /(?:공격력|마력)\s*([0-9,]+)/i, label: '공(+)' },
      { stat: 'maxHp', re: /(?:최대\s*HP|HP)\s*([0-9,]+)/i, label: 'HP(+)' }
    ];
    for (const p of flatPatterns) {
      const match = trimmed.match(p.re);
      if (match) {
        const val = Number(match[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) {
          return { stat: p.stat, value: val, raw: trimmed, display: `${p.label} ${val}` };
        }
      }
    }
  }

  return { stat: 'NONE', value: 0, raw: trimmed, display: '잡옵' };
}

/**
 * Parses OCR extracted text from an equipment modal popup,
 * extracting both 윗잠 (잠재 옵션) and 밑잠 (에디셔널 잠재 옵션).
 */
export function parseEquipmentOcrText(text, starCount = null, jobMainStat = 'LUK', jobSubStat = null) {
  if (!text || typeof text !== 'string') {
    return { error: '텍스트가 없습니다.' };
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {
    slotId: null,
    slotName: null,
    slotType: 'armor',
    itemName: null,
    grade: 'epic',
    level: 120,
    quality: null,
    currentStar: typeof starCount === 'number' ? starCount : null,
    potentialLines: [],
    hasAdditional: false,
    additionalGrade: null,
    additionalLines: [],
    equippedStats: {}
  };

  // 1. Split text into Main Potential (윗잠) and Additional Potential (밑잠)
  const hasAdditional = /(?:에디[셔서][널블서]?|에디|additional)/i.test(text);
  const addSplit = text.split(/(?:에디[셔서][널블서]?|에디|additional)/i);
  const mainSec = addSplit[0];
  const addSec = hasAdditional ? (addSplit.slice(1).join('\n') || '') : '';

  // 1A. Detect Main Potential Grade (윗잠)
  // Check immediately following '잠재 옵션' first so item quality (e.g. 레전더리 상의) does not shadow cube grade
  let mainGradeMatch = null;
  const potSecText = /(?:잠재\s*[옵점][션선]?|[점잠]재\s*옵션)/i.test(mainSec)
    ? mainSec.split(/(?:잠재\s*[옵점][션선]?|[점잠]재\s*옵션)/i)[1]
    : null;
  if (potSecText) {
    mainGradeMatch = potSecText.match(/(유니크|유4크|유43|유닉|레전더리|레전|에픽|레어|미스틱)/) ||
                     potSecText.match(/^\s*(?:[^\n]*?)(Ey|sua)/i);
  }
  if (!mainGradeMatch) {
    mainGradeMatch = mainSec.match(/잠재\s*[옵점][션선]?[^\n]*(Ey|sua|유니크|유4크|유43|유닉|레전더리|레전|에픽|레어|미스틱)/i) ||
                     mainSec.match(/(유니크|유4크|유43|유닉|레전더리|레전|에픽|레어|미스틱)/);
  }
  if (mainGradeMatch) {
    const rawGrade = (mainGradeMatch[1] || '').toLowerCase();
    if (rawGrade === '유4크' || rawGrade === '유43' || rawGrade === '유닉' || rawGrade === 'ey' || rawGrade === 'sua') {
      result.grade = 'unique';
    } else if (rawGrade === '레전') {
      result.grade = 'legendary';
    } else {
      result.grade = GRADE_MAP[rawGrade] || 'epic';
    }
  }

  // 1B. Detect Additional Potential Grade (밑잠)
  if (hasAdditional && addSec) {
    const addGradeMatch = addSec.match(/(노말|레어|에픽|유니크|유4크|유43|유닉|레전더리|레전)/) ||
                          addSec.match(/에디[^\n]*(Ey|sua)/i);
    if (addGradeMatch) {
      const rawAddGrade = (addGradeMatch[1] || '').toLowerCase();
      if (rawAddGrade === '유4크' || rawAddGrade === '유43' || rawAddGrade === '유닉' || rawAddGrade === 'ey' || rawAddGrade === 'sua') {
        result.additionalGrade = 'unique';
      } else if (rawAddGrade === '레전') {
        result.additionalGrade = 'legendary';
      } else {
        result.additionalGrade = GRADE_MAP[rawAddGrade] || 'normal';
      }
    } else {
      result.additionalGrade = 'normal';
    }
  } else {
    result.additionalGrade = null;
  }

  // 2. Detect Slot
  for (const def of SLOT_DEFINITIONS) {
    const matched = def.keywords.some(kw => kw.test(text));
    if (matched) {
      result.slotId = def.id;
      result.slotName = def.name;
      result.slotType = def.slotType;
      break;
    }
  }

  // Fallback to hat if nothing matched
  if (!result.slotId) {
    result.slotId = 'hat';
    result.slotName = '모자';
  }

  // 3. Detect Item Name
  for (const line of lines) {
    if (/투구|모자|상의|하의|장갑|신발|망토|벨트|목걸이|귀고리|반지|견장|팬던트|눈\s*장식|얼굴\s*장식|포켓/.test(line)) {
      if (!/강화|효과|슬롯|장착중|장착|잠재|옵션|분해|스킬|활성화/.test(line)) {
        if (/자[쿰룸]의?\s*투구/.test(line)) {
          result.itemName = '자쿰의 투구';
          break;
        }
        if (/자일즈의?\s*망토/.test(line)) {
          result.itemName = '검은색 자일즈의 망토';
          break;
        }
        let cleaned = line
          .replace(/\[.*?\]/g, '') // remove bracket noise
          .replace(/[a-zA-Z0-9_\-\.\:\;\|\\\/]/g, '') // remove stray alphanumeric/symbol noise
          .replace(/(최상급|상급|중급|하급|유니크|에픽|레어|레전더리|미스틱)/g, '')
          .trim();
        // Match specific weapon/armor suffix
        const nameMatch = cleaned.match(/([가-힣\s]+(?:투구|모자|상의|하의|장갑|신발|망토|벨트|목걸이|귀고리|반지|견장|팬던트))/);
        if (nameMatch && nameMatch[1].trim().length >= 2) {
          result.itemName = nameMatch[1].trim();
          break;
        } else if (cleaned.length >= 2) {
          result.itemName = cleaned;
          break;
        }
      }
    }
  }
  if (!result.itemName) {
    result.itemName = result.slotName;
  }

  // 4. Detect Level & Quality
  const lvMatch = text.match(/Lv\s*\.?\s*(\d+)/i);
  if (lvMatch) {
    result.level = Number(lvMatch[1]);
  }
  const qMatch = text.match(/(최상급|상급|중급|하급)/);
  if (qMatch) {
    result.quality = qMatch[1];
  }

  // 5. Detect Starforce from text if not detected via pixel peaks
  if (result.currentStar === null) {
    const sfMatch = text.match(/(?:⭐|★|\b성\b)\s*(\d+)/i) || text.match(/(\d+)\s*성/);
    if (sfMatch) {
      result.currentStar = Math.min(30, Math.max(0, Number(sfMatch[1])));
    } else {
      result.currentStar = 10;
    }
  }

  // 6. Extract up to 3 lines for a potential section
  function extract3Lines(sec, gradeForLines = 'epic') {
    if (!sec) {
      return [
        { stat: 'NONE', value: 0, display: '잡옵' },
        { stat: 'NONE', value: 0, display: '잡옵' },
        { stat: 'NONE', value: 0, display: '잡옵' }
      ];
    }
    const lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
    const parsedLines = [];
    for (const line of lines) {
      if (parsedLines.length >= 3) break;
      if (/강화\s*효과|상세보기|장착\s*효과|자동\s*분해|일괄\s*분해|슬롯|보스\s*몬스터/.test(line)) continue;
      if (/^(?:잠재\s*[옵점][션선]?|[점잠]재\s*옵션|옵션|에디셔널)/.test(line)) continue;
      if (/\b\d+\.\d+\s*%/.test(line)) continue; // Cube potentials never contain decimal numbers; decimals are base stats
      if (!line.includes('%') && /공격력\s+[0-9,]{4,}/.test(line)) continue;
      if (!line.includes('%') && /최대\s*HP\s+[0-9,]{4,}/.test(line)) continue;
      if (!line.includes('%') && /방어력\s+[0-9,]{3,}/.test(line)) continue;

      const isCandidate = /(?:LUK|STR|DEX|PEX|INT|HP|MP|공격력|마력|크리티컬|데미지|대미지|더미지|도미지|태미지|som|dmg|dam|뎀|보스|방어|최대|재사용|쿨감|[0-9.]+%\s*)/i.test(line);
      if (!isCandidate) continue;

      const slotIdx = parsedLines.length + 1;
      const parsed = parsePotentialLine(line, jobMainStat, jobSubStat, gradeForLines, slotIdx);
      parsedLines.push(parsed);
    }
    while (parsedLines.length < 3) {
      parsedLines.push({ stat: 'NONE', value: 0, display: '잡옵' });
    }
    return parsedLines;
  }

  // 6. Detect Main Potential Lines (윗잠 3줄)
  const potSec = /(?:잠재\s*[옵점][션선]?|[점잠]재\s*옵션)/i.test(mainSec)
    ? mainSec.split(/(?:잠재\s*[옵점][션선]?|[점잠]재\s*옵션)/i)[1]
    : mainSec;
  result.potentialLines = extract3Lines(potSec, result.grade);

  // 7. Detect Additional Potential Lines (밑잠 3줄)
  result.hasAdditional = hasAdditional;
  if (hasAdditional && addSec) {
    result.additionalLines = extract3Lines(addSec, result.additionalGrade);
  } else {
    result.additionalLines = [];
  }

  // 8. Detect Equipped Stats (공격력, 데미지, 크확, HP)
  const equipSec = text.includes('장착') && text.includes('효과') ? text.split(/장착\s*효과/)[1] : text;
  if (equipSec) {
    const atkMatch = equipSec.match(/공격력\s*([0-9,]+)(?!%)/);
    if (atkMatch) result.equippedStats.attackFlat = Number(atkMatch[1].replace(/,/g, ''));
    const dmgMatch = equipSec.match(/데미지\s*([0-9.]+)\s*%/);
    if (dmgMatch) result.equippedStats.damage = Number(dmgMatch[1]);
    const crMatch = equipSec.match(/크리티컬\s*확률\s*([0-9.]+)\s*%/);
    if (crMatch) result.equippedStats.critRate = Number(crMatch[1]);
    const hpMatches = [...equipSec.matchAll(/최대\s*HP\s*([0-9,]+)/g)];
    if (hpMatches.length) {
      result.equippedStats.maxHp = hpMatches.reduce((sum, m) => sum + Number(m[1].replace(/,/g, '')), 0);
    }
  }

  return result;
}

/**
 * Counts yellow star peaks from raw RGBA pixel data
 * Yellow star: R > 195, G > 150, B < 110
 */
export function countYellowStarsFromPixels(rgbaData, width, height, channels = 4) {
  if (!rgbaData || !width || !height) return 0;

  const yellowCols = new Array(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = rgbaData[idx];
      const g = rgbaData[idx + 1];
      const b = rgbaData[idx + 2];
      if (r > 195 && g > 150 && b < 110) {
        yellowCols[x]++;
      }
    }
  }

  let peaks = 0;
  let inPeak = false;
  for (let x = 0; x < width; x++) {
    if (yellowCols[x] >= 2) {
      if (!inPeak) {
        peaks++;
        inPeak = true;
      }
    } else {
      inPeak = false;
    }
  }

  return Math.min(30, peaks);
}
