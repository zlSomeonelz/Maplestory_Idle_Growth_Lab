import assert from 'node:assert/strict';
import {
  parsePotentialLine,
  parseEquipmentOcrText,
  countYellowStarsFromPixels,
  SLOT_DEFINITIONS,
  GRADE_MAP
} from '../equip-ocr.mjs';

// 1. Potential Line Parsing with Job Intelligence
const pot1 = parsePotentialLine('LUK 9%', 'LUK');
assert.equal(pot1.stat, 'mainStatPct');
assert.equal(pot1.value, 9);

const potOffStat = parsePotentialLine('INT 6%', 'LUK');
assert.equal(potOffStat.stat, 'NONE', 'INT on LUK job must be classified as NONE (잡옵)');

const potHpPct = parsePotentialLine('최대 HP 15%', 'LUK');
assert.equal(potHpPct.stat, 'maxHpPct');
assert.equal(potHpPct.value, 15);

const potSubStat = parsePotentialLine('DEX 3%', 'LUK');
assert.equal(potSubStat.stat, 'subStatPct');
assert.equal(potSubStat.value, 3);

const pot2 = parsePotentialLine('크리티컬 확률 6%', 'LUK');
assert.equal(pot2.stat, 'critRate');
assert.equal(pot2.value, 6);

const pot3 = parsePotentialLine('데미지 12%', 'LUK');
assert.equal(pot3.stat, 'damage');
assert.equal(pot3.value, 12);

// 1B. Cross-Job Stat Intelligence Tests (Hero / Bowmaster / Bishop / Night Walker)
const heroLuk = parsePotentialLine('LUK 9%', 'STR', 'DEX');
assert.equal(heroLuk.stat, 'NONE', 'For STR job (Hero), LUK 9% must be NONE (잡옵)');

const heroStr = parsePotentialLine('STR 9%', 'STR', 'DEX');
assert.equal(heroStr.stat, 'mainStatPct', 'For STR job (Hero), STR 9% must be mainStatPct');

const heroDex = parsePotentialLine('DEX 3%', 'STR', 'DEX');
assert.equal(heroDex.stat, 'subStatPct', 'For STR job (Hero), DEX 3% must be subStatPct');

const bowmasterDex = parsePotentialLine('DEX 9%', 'DEX', 'STR');
assert.equal(bowmasterDex.stat, 'mainStatPct', 'For DEX job (Bowmaster), DEX 9% must be mainStatPct');

const bishopInt = parsePotentialLine('INT 9%', 'INT', 'LUK');
assert.equal(bishopInt.stat, 'mainStatPct', 'For INT job (Bishop), INT 9% must be mainStatPct');

// 2. Real In-Game Modal OCR Text Test (Zakum Helmet)
const realOcrText = `
모자슬롯강화효과
자쿰의 투구
유니크 모자 장착중
최상급
Lv.89
잠재 옵션 유니크
LUK 9%
크리티컬 확률 6%
데미지 12%
장착효과
공격력 4947
방어력 965
데미지 18.7%
크리티컬 확률 6.2%
최대 HP 24,400
`;

const res = parseEquipmentOcrText(realOcrText, 10, 'LUK');
assert.equal(res.slotId, 'hat', 'Slot must be hat');
assert.equal(res.slotName, '모자', 'Slot name must be 모자');
assert.equal(res.itemName, '자쿰의 투구', 'Item name must be 자쿰의 투구');
assert.equal(res.grade, 'unique', 'Grade must be unique');
assert.equal(res.level, 89, 'Level must be 89');
assert.equal(res.currentStar, 10, 'Starforce must be 10');
assert.equal(res.potentialLines.length, 3);
assert.equal(res.potentialLines[0].stat, 'mainStatPct');
assert.equal(res.potentialLines[0].value, 9);
assert.equal(res.potentialLines[1].stat, 'critRate');
assert.equal(res.potentialLines[1].value, 6);
assert.equal(res.potentialLines[2].stat, 'damage');
assert.equal(res.potentialLines[2].value, 12);
assert.equal(res.hasAdditional, false, 'Zakum Helmet has no additional potential');
assert.equal(res.additionalGrade, null);
assert.equal(res.additionalLines.length, 0);

// 2B. Top with Unopened Additional Potential & Cursor Noise
const topOcrText = `
상의 슬롯 강화 효과
다크 카테
레전더리 상의 장착중
하급 Lv.87
잠재 옵션 유니크
크리티컬 확률 9%
INT 200
LUK 9× 빼
장착효과
공격력 5567
최대 HP 27617
`;
const topRes = parseEquipmentOcrText(topOcrText, 10, 'LUK');
assert.equal(topRes.slotId, 'top');
assert.equal(topRes.slotName, '상의');
assert.equal(topRes.grade, 'unique');
assert.equal(topRes.currentStar, 10);
assert.equal(topRes.potentialLines[0].stat, 'critRate');
assert.equal(topRes.potentialLines[0].value, 9);
assert.equal(topRes.potentialLines[1].stat, 'NONE'); // INT 200 is off-stat (잡옵)
assert.equal(topRes.potentialLines[2].stat, 'mainStatPct'); // LUK 9%
assert.equal(topRes.potentialLines[2].value, 9);
assert.equal(topRes.hasAdditional, false);
assert.equal(topRes.additionalGrade, null);
assert.equal(topRes.additionalLines.length, 0);

// 3. Dual Potential Test (Cloak with 윗잠 and 밑잠)
const cloakOcrText = `
망토 슬롯 강화 효과
SSSSN 55885
눌러서 옵션 상세보기
HSM 자일즈의 망토
유니크 망토 장착중
상급 Lv.87

잠재 옵션               유니크
LUK                  9%
INT                  6%
최대 HP               15%

에디셔널 잠재 옵션        노말
STR                    3%
LUK                    3%
DEX                    3%

장착효과
공격력 5148
최대 HP 25254
`;

const cloakRes = parseEquipmentOcrText(cloakOcrText, 12, 'LUK');
assert.equal(cloakRes.slotId, 'cape');
assert.equal(cloakRes.slotName, '망토');
assert.equal(cloakRes.itemName, '검은색 자일즈의 망토');
assert.equal(cloakRes.currentStar, 12);

// 윗잠
assert.equal(cloakRes.grade, 'unique');
assert.equal(cloakRes.potentialLines.length, 3);
assert.equal(cloakRes.potentialLines[0].stat, 'mainStatPct');
assert.equal(cloakRes.potentialLines[0].value, 9);
assert.equal(cloakRes.potentialLines[1].stat, 'NONE'); // INT 6% is off-stat (잡옵)
assert.equal(cloakRes.potentialLines[2].stat, 'maxHpPct');
assert.equal(cloakRes.potentialLines[2].value, 15);

// 밑잠 (에디셔널 잠재 옵션)
assert.equal(cloakRes.hasAdditional, true);
assert.equal(cloakRes.additionalGrade, 'normal');
assert.equal(cloakRes.additionalLines.length, 3);
assert.equal(cloakRes.additionalLines[0].stat, 'NONE'); // STR 3% is off-stat (잡옵)
assert.equal(cloakRes.additionalLines[1].stat, 'mainStatPct'); // LUK 3%
assert.equal(cloakRes.additionalLines[1].value, 3);
assert.equal(cloakRes.additionalLines[2].stat, 'subStatPct');  // DEX 3%
assert.equal(cloakRes.additionalLines[2].value, 3);

// 3C. Dual Potential Test on STR Job (Hero) - LUK must NOT be main stat!
const heroCloakRes = parseEquipmentOcrText(cloakOcrText, 12, 'STR', 'DEX');
assert.equal(heroCloakRes.potentialLines[0].stat, 'NONE', 'LUK 9% must be NONE (잡옵) for Hero');
assert.equal(heroCloakRes.potentialLines[1].stat, 'NONE', 'INT 6% must be NONE (잡옵) for Hero');
assert.equal(heroCloakRes.potentialLines[2].stat, 'maxHpPct');
assert.equal(heroCloakRes.additionalLines[0].stat, 'mainStatPct', 'STR 3% must be mainStatPct for Hero');
assert.equal(heroCloakRes.additionalLines[0].value, 3);
assert.equal(heroCloakRes.additionalLines[1].stat, 'NONE', 'LUK 3% must be NONE (잡옵) for Hero');
assert.equal(heroCloakRes.additionalLines[2].stat, 'subStatPct', 'DEX 3% must be subStatPct for Hero');
assert.equal(heroCloakRes.additionalLines[2].value, 3);

// 3D. Decimal Percentages & Leaked Equipment Stats Prevention
assert.equal(parsePotentialLine('뎀 5.7%', 'LUK').stat, 'NONE', 'Decimal percent must be NONE (잡옵)');
assert.equal(parsePotentialLine('보스 몬스터 데미지 5.7%', 'LUK').stat, 'NONE', 'Decimal percent must be NONE (잡옵)');
assert.equal(parsePotentialLine('크리티컬 데미지 6.2%', 'LUK').stat, 'NONE', 'Decimal percent must be NONE (잡옵)');

const leakedSecOcrText = `
망토 슬롯 강화 효과
잠재 옵션 유니크
LUK 9%
INT 6%
최대 HP 15%
에디셔널 잠재 옵션 노말
STR 3%
LUK 3%
DEX 3%
뎀 5.7%
크리티컬 데미지 6.2%
`;
const leakedRes = parseEquipmentOcrText(leakedSecOcrText, 12, 'LUK');
assert.equal(leakedRes.additionalLines.length, 3);
assert.equal(leakedRes.additionalLines[0].stat, 'NONE'); // STR 3%
assert.equal(leakedRes.additionalLines[1].stat, 'mainStatPct'); // LUK 3%
assert.equal(leakedRes.additionalLines[2].stat, 'subStatPct'); // DEX 3%
assert.ok(!leakedRes.additionalLines.some(l => l.raw?.includes('5.7%')), '5.7% must not be in additionalLines');

// 4. Yellow Star Pixel Counter Test
const width = 100;
const height = 10;
const buffer = new Uint8Array(width * height * 4);
const peakCenters = [10, 25, 40, 55, 70];
for (const pc of peakCenters) {
  for (let dx = 0; dx < 4; dx++) {
    const x = pc + dx;
    for (let y = 2; y < 8; y++) {
      const idx = (y * width + x) * 4;
      buffer[idx] = 230;
      buffer[idx + 1] = 200;
      buffer[idx + 2] = 50;
      buffer[idx + 3] = 255;
    }
  }
}
const starCount = countYellowStarsFromPixels(buffer, width, height, 4);
assert.equal(starCount, 5);

console.log('equip-ocr dual potential (윗잠 & 밑잠) unit tests passed cleanly!');
