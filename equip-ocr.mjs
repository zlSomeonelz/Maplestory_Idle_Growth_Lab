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
  rare: '레어',
  epic: '에픽',
  unique: '유니크',
  legendary: '레전더리',
  mystic: '미스틱'
};

/**
 * Maps potential option text to engine stat key
 */
export function parsePotentialLine(line) {
  if (!line || typeof line !== 'string') return { stat: 'NONE', value: 0 };
  const trimmed = line.trim();

  const patterns = [
    { stat: 'critDamage', re: /(?:크리티컬\s*데미지|크뎀)\s*([0-9.]+)\s*%/i },
    { stat: 'critRate', re: /(?:크리티컬\s*확률|크확)\s*([0-9.]+)\s*%/i },
    { stat: 'bossDamage', re: /(?:보스\s*몬스터\s*공격\s*시\s*데미지|보스\s*데미지|보스\s*공격력|보공)\s*([0-9.]+)\s*%/i },
    { stat: 'attackPct', re: /(?:공격력|마력)\s*([0-9.]+)\s*%/i },
    { stat: 'damage', re: /(?:데미지|뎀)\s*([0-9.]+)\s*%/i },
    { stat: 'defPen', re: /(?:방어율\s*무시|방어력\s*관통|방무|방관)\s*([0-9.]+)\s*%/i },
    { stat: 'cooldownReduction', re: /(?:스킬\s*재사용\s*대기시간\s*감소|재사용\s*대기시간)\s*([0-9.]+)\s*초?/i },
    { stat: 'mainStatPct', re: /(?:STR|DEX|INT|LUK|주스탯|올스탯)\s*([0-9.]+)\s*%/i },
    { stat: 'attackFlat', re: /(?:공격력|마력)\s*([0-9,]+)(?!%)/i },
    { stat: 'mainStat', re: /(?:STR|DEX|INT|LUK|주스탯)\s*([0-9,]+)(?!%)/i },
    { stat: 'maxHp', re: /(?:최대\s*HP|HP)\s*([0-9,]+)(?!%)/i }
  ];

  for (const p of patterns) {
    const match = trimmed.match(p.re);
    if (match) {
      const val = Number(match[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        return { stat: p.stat, value: val, raw: trimmed };
      }
    }
  }

  return { stat: 'NONE', value: 0, raw: trimmed };
}

/**
 * Parses OCR extracted text from an equipment modal popup
 */
export function parseEquipmentOcrText(text, starCount = null) {
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
    equippedStats: {}
  };

  // 1. Detect Grade
  const gradeMatch = text.match(/(유니크|레전더리|에픽|레어|미스틱)/);
  if (gradeMatch) {
    result.grade = GRADE_MAP[gradeMatch[1]] || 'epic';
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
    // If line mentions equipment keywords, exclude UI headers
    if (/투구|모자|상의|하의|장갑|신발|망토|벨트|목걸이|귀고리|반지|견장|팬던트|눈\s*장식|얼굴\s*장식|포켓/.test(line)) {
      if (!/강화|효과|슬롯|장착중|장착|잠재|옵션|분해|스킬|활성화/.test(line)) {
        if (/자[쿰룸]의?\s*투구/.test(line)) {
          result.itemName = '자쿰의 투구';
          break;
        }
        let cleaned = line
          .replace(/\[.*?\]/g, '') // remove bracket noise like [if Rio] or [2777 sassy gf]
          .replace(/[a-zA-Z0-9_\-\.\:\;\|\\\/]/g, '') // remove alphanumeric and symbol noise
          .replace(/^(최상급|상급|중급|하급|유니크|에픽|레어|레전더리|미스틱)\s*/g, '')
          .trim();
        if (cleaned.length >= 2) {
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
      // Check for E ⭐10 pattern (Lv.89 E 10)
      const eSfMatch = text.match(/Lv\s*\.?\s*\d+\s*[A-Za-z]?\s*.*?(\d{1,2})/);
      if (eSfMatch && Number(eSfMatch[1]) <= 30) {
        result.currentStar = Number(eSfMatch[1]);
      } else {
        result.currentStar = 10; // Default safe fallback
      }
    }
  }

  // 6. Detect Potential Lines (Look in '잠재 옵션' area or lines with percentages)
  const potSec = text.includes('잠재 옵션') ? text.split('잠재 옵션')[1] : text;
  const potLinesRaw = potSec.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of potLinesRaw) {
    if (result.potentialLines.length >= 3) break;
    // Stop if reaching equipped stats or game buttons
    if (/장착\s*효과|자동\s*분해|일괄\s*분해|강화/.test(line)) break;

    const parsedLine = parsePotentialLine(line);
    if (parsedLine.stat !== 'NONE') {
      result.potentialLines.push(parsedLine);
    }
  }

  // Ensure exactly 3 lines
  while (result.potentialLines.length < 3) {
    result.potentialLines.push({ stat: 'NONE', value: 0 });
  }

  // 7. Detect Equipped Stats (공격력, 데미지, 크확, HP)
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
