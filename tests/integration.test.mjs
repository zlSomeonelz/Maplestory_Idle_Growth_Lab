import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');

// 1. Verify all critical UI elements exist in index.html
const requiredIds = [
  'cloudOpenBtn', 'cloudAccountBar', 'cloudAccountLabel', 'cloudStatus',
  'cloudLoginModal', 'cloudCloseBtn', 'cloudEmail', 'cloudLoginBtn', 'cloudGoogleBtn',
  'cloudLogoutBtn', 'cloudSaveBtn', 'cloudLoadBtn',
  'activePresetLabel', 'presetName', 'savePreset', 'presetSelect', 'loadPreset', 'deletePreset',
  'exportPresetBtn', 'importPresetBtn', 'presetFileInput',
  'buildPresetSelect', 'buildPresetName', 'saveBuildPresetBtn', 'updateBuildPresetBtn',
  'loadBuildPresetBtn', 'deleteBuildPresetBtn', 'buildPresetStatus',
  'job', 'level', 'attackFlat', 'attackPct', 'maxHp', 'playerDefense', 'maxMp', 'evasion',
  'mainStat', 'mainStatPct', 'subStat', 'damage', 'damageAmp', 'finalDamage',
  'critRate', 'critDamage', 'minDamage', 'maxDamage', 'mastery', 'skillCoefficient',
  'attackInterval', 'attackSpeed', 'statInputMode', 'statSTR', 'statDEX', 'statINT', 'statLUK',
  'jobSkillsBox', 'jobSkillContent',
  'accuracy', 'defPen', 'bossDamage', 'normalDamage', 'basicDamage', 'skillDamage',
  'statusDamage', 'dmgReduction', 'companionDuration', 'buffDuration', 'debuffResist',
  'extraTargets', 'cooldownReductionPct', 'cooldownReductionSec',
  'skillLevel1', 'skillLevel2', 'skillLevel3', 'skillLevel4', 'mainStatPerLevel1',
  'targetType', 'pvpContent', 'targetLevel', 'targetDefense', 'targetMaxHp', 'targetTaken', 'targetCritResist',
  'calculateCombat', 'avgDamage', 'damageRange', 'dps', 'dpsNote', 'combatPower', 'combatPowerNote',
  'defenseFactor', 'defenseNote', 'combatBreakdown', 'stageVerdict', 'statEfficienciesRoot', 'specUpGuideContent',
  'loadOcrCompanionsBtn', 'clearInventoryBtn', 'companionInventoryStatus', 'ownedCompanionList',
  'recommendFromInventoryBtn', 'companionOptimizeBtn', 'companionResetBtn', 'companionSlots',
  'companionVerdict', 'companionSummary', 'compScenario', 'compGoal', 'compChapterFocus', 'compPreset',
  'applyCommunityPresetBtn', 'companionGuide', 'communityPreset',
  'contentType', 'contentTarget', 'stageMode', 'stageChapter', 'stageSelect', 'stageDataStatus',
  'stageInfo', 'contentGuide', 'contentVerdict', 'contentSummary',
  'cubeEquipment', 'cubeSlot', 'cubeGrade', 'cubeCost', 'currentOptions', 'candidateOptions',
  'calculateCube', 'cubeGoalMode', 'cubeGoal1', 'cubeGoal2', 'cubeGoal3', 'cubeTargetSummary',
  'cubeDelta', 'cubeCurrentDps', 'cubeCandidateDps', 'cubePowerDelta', 'cubeCurrentPower', 'cubeCandidatePower',
  'successRate', 'attempts', 'attemptCost', 'calculateProbability', 'probabilityResult',
  'openOcrFromDrawerBtn', 'statToolDrawer', 'companionToolDrawer', 'presetToolDrawer',
  'ocrModal', 'closeOcrModalBtn', 'ocrModalDrop', 'ocrModalFile', 'ocrPasteClipboardBtn',
  'runOcrModalBtn', 'ocrModalStatus', 'ocrModalResults', 'applyOcrModalBtn',
  'saveQuick', 'resetAll'
];

for (const id of requiredIds) {
  assert.ok(html.includes(`id="${id}"`), `index.html must contain element with id="${id}"`);
}

// 2. Verify dataset files exist and are valid JSON
const datasets = [
  'data/combat-rules.json',
  'data/stat-rules.json',
  'data/job-stats.json',
  'data/probabilities.json',
  'data/potential-probabilities.json',
  'data/companion-runtime-data.json',
  'data/companion-rules.json',
  'data/stage-data.json',
  'data/boss-data.json',
  'data/growth-dungeon-data.json',
  'data/guild-data.json',
  'data/drop-table-data.json',
  'data/job-skills.json',
  'data/official-patch-notes.json'
];

for (const file of datasets) {
  assert.ok(fs.existsSync(file), `Dataset file ${file} must exist`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(parsed && typeof parsed === 'object', `${file} must parse into a non-null object`);
}

// 3. Verify stage data coverage
const stageData = JSON.parse(fs.readFileSync('data/stage-data.json', 'utf8'));
assert.ok(stageData.hunt.length > 500, 'stage hunt dataset should have extensive stages');
assert.ok(stageData.trial.length > 100, 'stage trial dataset should have extensive stages');

// 4. Verify companion runtime coverage
const companionData = JSON.parse(fs.readFileSync('data/companion-runtime-data.json', 'utf8'));
assert.ok(companionData.supporters.length >= 42, 'companion runtime must cover 14 jobs x 3+ grades');
assert.ok(Object.keys(companionData.equippedStats).length >= 42, 'equipped stats table must cover all job/grade pairs');

// 5. Skill loadout optimizer wiring
assert.ok(fs.existsSync('skill-optimizer.mjs'), 'skill-optimizer.mjs must exist');
assert.ok(js.includes("from './skill-optimizer.mjs'"), 'app.js must import the skill optimizer');
assert.ok(js.includes('skillLoadoutPanel') && js.includes('runSkillLoadoutOptimizer'), 'app.js must render the loadout optimizer panel');
const jobSkills = JSON.parse(fs.readFileSync('data/job-skills.json', 'utf8'));
const nwActives = jobSkills.nightWalker.stages.flatMap(s => s.active.map(a => a.name));
assert.ok(nwActives.includes('럭키 세븐') && nwActives.includes('쉐도우 스티치'), 'Night Walker must include 1st-job and 4th-job actives');

console.log('All integration assertions passed cleanly!');
