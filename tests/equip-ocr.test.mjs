import assert from 'node:assert/strict';
import {
  parsePotentialLine,
  parseEquipmentOcrText,
  countYellowStarsFromPixels,
  SLOT_DEFINITIONS,
  GRADE_MAP
} from '../equip-ocr.mjs';

// 1. Potential Line Parsing
const pot1 = parsePotentialLine('LUK 9%');
assert.equal(pot1.stat, 'mainStatPct');
assert.equal(pot1.value, 9);

const pot2 = parsePotentialLine('크리티컬 확률 6%');
assert.equal(pot2.stat, 'critRate');
assert.equal(pot2.value, 6);

const pot3 = parsePotentialLine('데미지 12%');
assert.equal(pot3.stat, 'damage');
assert.equal(pot3.value, 12);

const pot4 = parsePotentialLine('크리티컬 데미지 8%');
assert.equal(pot4.stat, 'critDamage');
assert.equal(pot4.value, 8);

const pot5 = parsePotentialLine('보스 몬스터 공격 시 데미지 20%');
assert.equal(pot5.stat, 'bossDamage');
assert.equal(pot5.value, 20);

const pot6 = parsePotentialLine('공격력 6%');
assert.equal(pot6.stat, 'attackPct');
assert.equal(pot6.value, 6);

const potEmpty = parsePotentialLine('방어력');
assert.equal(potEmpty.stat, 'NONE');

// 2. Real In-Game Modal OCR Text Test (User's Zakum Helmet)
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

const res = parseEquipmentOcrText(realOcrText, 10);
assert.equal(res.slotId, 'hat', 'Slot must be hat');
assert.equal(res.slotName, '모자', 'Slot name must be 모자');
assert.equal(res.itemName, '자쿰의 투구', 'Item name must be 자쿰의 투구');
assert.equal(res.grade, 'unique', 'Grade must be unique');
assert.equal(res.level, 89, 'Level must be 89');
assert.equal(res.quality, '최상급', 'Quality must be 최상급');
assert.equal(res.currentStar, 10, 'Starforce must be 10');

assert.equal(res.potentialLines.length, 3, 'Must have 3 potential lines');
assert.equal(res.potentialLines[0].stat, 'mainStatPct');
assert.equal(res.potentialLines[0].value, 9);
assert.equal(res.potentialLines[1].stat, 'critRate');
assert.equal(res.potentialLines[1].value, 6);
assert.equal(res.potentialLines[2].stat, 'damage');
assert.equal(res.potentialLines[2].value, 12);

assert.equal(res.equippedStats.attackFlat, 4947);
assert.equal(res.equippedStats.damage, 18.7);
assert.equal(res.equippedStats.critRate, 6.2);
assert.equal(res.equippedStats.maxHp, 24400);

// 3. Glove with Crit Damage Test
const gloveOcrText = `
장갑슬롯강화효과
해적 장갑
에픽 장갑
Lv.95
잠재 옵션 에픽
크리티컬 데미지 4%
STR 6%
잡옵
`;
const gloveRes = parseEquipmentOcrText(gloveOcrText, 12);
assert.equal(gloveRes.slotId, 'glove');
assert.equal(gloveRes.slotName, '장갑');
assert.equal(gloveRes.grade, 'epic');
assert.equal(gloveRes.currentStar, 12);
assert.equal(gloveRes.potentialLines[0].stat, 'critDamage');
assert.equal(gloveRes.potentialLines[0].value, 4);
assert.equal(gloveRes.potentialLines[1].stat, 'mainStatPct');
assert.equal(gloveRes.potentialLines[1].value, 6);

// 4. Yellow Star Pixel Counter Test
// Create a fake 100x10 RGBA buffer with 5 yellow star stripes
const width = 100;
const height = 10;
const buffer = new Uint8Array(width * height * 4);

// Paint 5 yellow peaks at x = 10..14, 25..29, 40..44, 55..59, 70..74
const peakCenters = [10, 25, 40, 55, 70];
for (const pc of peakCenters) {
  for (let dx = 0; dx < 4; dx++) {
    const x = pc + dx;
    for (let y = 2; y < 8; y++) {
      const idx = (y * width + x) * 4;
      buffer[idx] = 230;     // R
      buffer[idx + 1] = 200; // G
      buffer[idx + 2] = 50;  // B
      buffer[idx + 3] = 255; // A
    }
  }
}

const starCount = countYellowStarsFromPixels(buffer, width, height, 4);
assert.equal(starCount, 5, 'Must accurately detect 5 star peaks');

console.log('equip-ocr unit tests passed cleanly!');
