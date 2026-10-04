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

/**
 * Maps potential option text to engine stat key
 */
export function parsePotentialLine(line, jobMainStat = 'LUK') {
  if (!line || typeof line !== 'string') return { stat: 'NONE', value: 0 };
  const trimmed = line.trim();

  // 1. Check HP% first (to avoid conflict with flat HP or number 10 in OCR)
  const hpPctMatch = trimmed.match(/(?:최대\s*HP|최대\s*1[0-9]|최대|HP)\s*([0-9.]+)\s*%/i);
  if (hpPctMatch) {
    const val = Number(hpPctMatch[1]);
    return { stat: 'maxHpPct', value: val, raw: trimmed, display: `HP ${val}%` };
  }

  // 2. Specific Stat Names (STR, DEX, INT, LUK, 주스탯)
  const statMatch = trimmed.match(/(?:^|[\s|:·•\-])(STR|DEX|PEX|INT|LUK|주스탯|부스탯|올스탯)\s*([0-9.]+)\s*%/i);
  if (statMatch) {
    let statName = statMatch[1].toUpperCase();
    if (statName === 'PEX') statName = 'DEX';
    const val = Number(statMatch[2]);
    const normalizedMain = (jobMainStat || 'LUK').toUpperCase();
    if (statName === '주스탯' || statName === '올스탯' || statName === normalizedMain) {
      return { stat: 'mainStatPct', value: val, raw: trimmed, display: `${statName} ${val}%` };
    }
    const subStatMap = { 'LUK': 'DEX', 'STR': 'DEX', 'DEX': 'STR', 'INT': 'LUK' };
    if (statName === '부스탯' || statName === subStatMap[normalizedMain]) {
      return { stat: 'subStatPct', value: val, raw: trimmed, display: `${statName} ${val}%` };
    }
    // Off-stat is 잡옵 for damage calculation
    return { stat: 'NONE', value: 0, raw: trimmed, display: `${statName} ${val}% (잡옵)` };
  }

  // 3. Other Combat & Utility Stats
  const pctPatterns = [
    { stat: 'critDamage', re: /(?:크리티컬\s*데미지|크뎀)\s*([0-9.]+)\s*%/i, label: '크뎀' },
    { stat: 'critRate', re: /(?:크리티컬\s*확률|크확)\s*([0-9.]+)\s*%/i, label: '크확' },
    { stat: 'bossDamage', re: /(?:보스\s*몬스터\s*공격\s*시\s*데미지|보스\s*데미지|보스\s*공격력|보공)\s*([0-9.]+)\s*%/i, label: '보공' },
    { stat: 'attackPct', re: /(?:공격력|마력)\s*([0-9.]+)\s*%/i, label: '공%' },
    { stat: 'damage', re: /(?:데미지|뎀)\s*([0-9.]+)\s*%/i, label: '데미지' },
    { stat: 'defPen', re: /(?:방어율\s*무시|방어력\s*관통|방무|방관)\s*([0-9.]+)\s*%/i, label: '방관' },
    { stat: 'cooldownReduction', re: /(?:스킬\s*재사용\s*대기시간\s*감소|재사용\s*대기시간)\s*([0-9.]+)\s*초?/i, label: '쿨감' }
  ];

  for (const p of pctPatterns) {
    const match = trimmed.match(p.re);
    if (match) {
      const val = Number(match[1]);
      if (!isNaN(val) && val > 0) {
        return { stat: p.stat, value: val, raw: trimmed, display: `${p.label} ${val}%` };
      }
    }
  }

  // 4. Flat Stats (only when line does not contain %)
  if (!trimmed.includes('%')) {
    const flatPatterns = [
      { stat: 'attackFlat', re: /(?:공격력|마력)\s*([0-9,]+)/i, label: '공(+)' },
      { stat: 'mainStat', re: /(?:STR|DEX|INT|LUK|주스탯)\s*([0-9,]+)/i, label: '주스탯(+)' },
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
export function parseEquipmentOcrText(text, starCount = null, jobMainStat = 'LUK') {
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
    additionalGrade: 'normal',
    additionalLines: [],
    equippedStats: {}
  };

  // 1. Split text into Main Potential (윗잠) and Additional Potential (밑잠)
  const addSplit = text.split(/(?:에디[셔서][널블서]?|에디|additional)/i);
  const mainSec = addSplit[0];
  const addSec = addSplit.slice(1).join('\n') || '';

  // 1A. Detect Main Potential Grade (윗잠)
  const mainGradeMatch = mainSec.match(/(유니크|유4크|유43|유닉|레전더리|레전|에픽|레어|미스틱)/) ||
                         mainSec.match(/잠재\s*[옵점][션선]?[^\n]*(Ey|sua)/i);
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
  if (addSec) {
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
    }
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
      const eSfMatch = text.match(/Lv\s*\.?\s*\d+\s*[A-Za-z]?\s*.*?(\d{1,2})/);
      if (eSfMatch && Number(eSfMatch[1]) <= 30) {
        result.currentStar = Number(eSfMatch[1]);
      } else {
        result.currentStar = 10;
      }
    }
  }

  // 6. Extract up to 3 lines for a potential section
  function extract3Lines(sec) {
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
      if (/강화\s*효과|상세보기|장착\s*효과|자동\s*분해|일괄\s*분해|슬롯/.test(line)) continue;
      if (/^(?:잠재\s*[옵점][션선]?|[점잠]재\s*옵션|옵션|에디셔널)/.test(line)) continue;
      if (!line.includes('%') && /공격력\s+[0-9,]+/.test(line)) continue;
      if (!line.includes('%') && /최대\s*HP\s+[0-9,]+/.test(line)) continue;

      const isCandidate = /(?:LUK|STR|DEX|PEX|INT|HP|MP|공격력|마력|크리티컬|데미지|보스|방어|최대|[0-9.]+%\s*)/i.test(line);
      if (!isCandidate) continue;

      const parsed = parsePotentialLine(line, jobMainStat);
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
  result.potentialLines = extract3Lines(potSec);

  // 7. Detect Additional Potential Lines (밑잠 3줄)
  result.additionalLines = extract3Lines(addSec);

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
