'use strict';

// Content-specific preset assignments. Each preset type owns a reusable set of
// named slots; contents only store which slot is equipped.
const STORE = 'maple-growth-lab-mvp-v2-content-presets';
const SLOT_COUNT = 12;
const CONTENTS = [
  { group: '챕터', items: [
    { id: 'chapter-hunt', label: '챕터 사냥', stageMode: 'hunt', targetType: 'normal' },
    { id: 'chapter-trial', label: '챕터 도전', stageMode: 'trial', targetType: 'normal' },
    { id: 'chapter-boss', label: '챕터 보스', stageMode: 'hunt', targetType: 'boss' },
  ]},
  { group: '성장 던전', items: [
    { id: 'weapon-dungeon', label: '무기 던전' },
    { id: 'exp-dungeon', label: '경험치 던전' },
    { id: 'equipment-dungeon', label: '장비 던전' },
    { id: 'training-ground', label: '용사의 수련장' },
    { id: 'enhancement-dungeon', label: '강화 던전' },
  ]},
  { group: '월드보스', items: [{ id: 'world-boss', label: '월드보스', targetType: 'boss' }] },
  { group: '파티퀘스트', items: [{ id: 'party-quest', label: '파티퀘스트' }] },
  { group: '아레나', items: [{ id: 'arena', label: '아레나', targetType: 'pvp' }] },
  { group: '길드', items: [
    { id: 'guild-battle', label: '길드 토벌전', targetType: 'boss' },
    { id: 'guild-war', label: '길드 대항전', targetType: 'boss' },
    { id: 'guild-raid-zakum', label: '길드 레이드: 자쿰', targetType: 'boss' },
  ]},
  { group: '보스 레이드', items: [{ id: 'boss-raid', label: '보스 레이드', targetType: 'boss' }] },
  { group: '글로세움', items: [{ id: 'glosseum', label: '글로세움' }] },
  { group: '이벤트', items: [{ id: 'event', label: '이벤트' }] },
  { group: '월드 아레나', items: [{ id: 'world-arena', label: '월드 아레나', targetType: 'pvp' }] },
];
const COMPANION_MEMBER_COUNT = 6;
const RUNTIME_JOB = { hero:'hero', paladin:'paladin', darkKnight:'dark-knight', archMageIceLightning:'archmage-il', archMageFirePoison:'archmage-fp', bishop:'bishop', bowmaster:'bowmaster', sniper:'marksman', nightLord:'night-lord', shadower:'shadower', viper:'viper', captain:'captain', nightWalker:'night-walker', windBreaker:'wind-breaker' };
let companionRuntime = null;
let activeCompanionSlotId = null;
let activeStatSlotId = null;
const STAT_FIELD_IDS = ['job', 'level', 'attackFlat', 'attackPct', 'mainStat', 'mainStatPct', 'subStat', 'damage', 'damageAmp', 'finalDamage', 'critRate', 'critDamage', 'minDamage', 'maxDamage', 'mastery', 'skillCoefficient', 'attackInterval', 'attackSpeed', 'targetDefense', 'targetHp', 'defPen', 'bossDamage', 'normalDamage', 'targetTaken', 'basicDamage', 'skillDamage', 'accuracy'];
const COMPONENTS = [
  ['stats', '스탯'],
  ['skill', '스킬'],
  ['companion', '동료'],
  ['relic', '유물'],
];
const $ = id => document.getElementById(id);
const allContents = () => CONTENTS.flatMap(group => group.items);
const contentById = id => allContents().find(item => item.id === id);
const componentLabel = id => COMPONENTS.find(([key]) => key === id)?.[1] || id;
const defaultKind = content => {
  if (content.targetType === 'pvp') return 'pvp';
  if (content.targetType === 'boss' || content.id.includes('boss') || content.id.includes('raid') || content.id.includes('guild-')) return 'boss';
  if (content.stageMode === 'trial' || content.id.includes('training')) return 'trial';
  return 'hunt';
};
function createSlot(type, index) {
  return { id: `${type}-${index + 1}`, name: `${index + 1}번 프리셋`, snapshot: null, ...(type === 'companion' ? { members: Array.from({ length: COMPANION_MEMBER_COUNT }, () => ({})) } : {}) };
}
function createLibrary() {
  return Object.fromEntries(COMPONENTS.map(([type]) => [type, Array.from({ length: SLOT_COUNT }, (_, index) => createSlot(type, index))]));
}
function defaultAssignments() {
  return Object.fromEntries(COMPONENTS.map(([type]) => [type, `${type}-1`]));
}
function defaultState() {
  return { activeContent: 'chapter-hunt', activeLibraryType: 'stats', companionSlotCount: 6, library: createLibrary(), statLibraries: {}, assignments: {}, contentSnapshots: {}, contentSettings: {} };
}
function cloneSlots(slots, type = 'stats') { return (Array.isArray(slots) ? slots : []).map((slot, index) => ({ ...createSlot(type, index), ...slot, id: `${type}-${index + 1}` })); }
function ensureStatLibraries(baseSlots, savedLibraries = {}) { const result = {}; allContents().forEach(content => { result[content.id] = cloneSlots(savedLibraries[content.id] || baseSlots, 'stats'); while (result[content.id].length < SLOT_COUNT) result[content.id].push(createSlot('stats', result[content.id].length)); }); return result; }
function migrateState(saved) {
  const next = defaultState();
  if (!saved || typeof saved !== 'object') return next;
  if (saved.library && saved.assignments) {
    const oldTypeFor = type => type === 'stats' ? (saved.library.stats || saved.library.ability || saved.library.equipment) : saved.library[type];
    const normalizeSlots = (type, oldSlots) => {
      const source = Array.isArray(oldSlots) ? oldSlots : [];
      const slots = source.map((slot, index) => ({ ...createSlot(type, index), ...slot, id: `${type}-${index + 1}`, ...(type === 'companion' ? { members: Array.isArray(slot.members) ? slot.members : Array.from({ length: COMPANION_MEMBER_COUNT }, () => ({})) } : {}) }));
      while (slots.length < SLOT_COUNT) slots.push(createSlot(type, slots.length));
      return slots;
    };
    next.library = Object.fromEntries(COMPONENTS.map(([type]) => [type, normalizeSlots(type, oldTypeFor(type))]));
    next.statLibraries = ensureStatLibraries(next.library.stats, saved.statLibraries || {});
    next.assignments = Object.fromEntries(Object.entries(saved.assignments).map(([contentId, assignment]) => {
      const nextAssignment = {};
      COMPONENTS.forEach(([type]) => {
        const oldId = type === 'stats' ? (assignment.stats || assignment.ability || assignment.equipment) : assignment[type];
        const index = String(oldId || '').match(/-(\d+)$/)?.[1] || '1';
        nextAssignment[type] = `${type}-${index}`;
      });
      return [contentId, nextAssignment];
    }));
    next.contentSnapshots = saved.contentSnapshots || {};
    next.contentSettings = saved.contentSettings || {};
    next.activeContent = saved.activeContent || next.activeContent;
    next.activeLibraryType = COMPONENTS.some(([type]) => type === saved.activeLibraryType) ? saved.activeLibraryType : 'stats';
    next.companionSlotCount = Math.max(1, Math.min(6, Number(saved.companionSlotCount) || 6));
    return next;
  }
  // Preserve the previous 1차 content settings where possible.
  Object.entries(saved.records || {}).forEach(([contentId, old]) => {
    next.assignments[contentId] = defaultAssignments();
    next.contentSnapshots[contentId] = old.snapshot || null;
    next.contentSettings[contentId] = { enabled: old.enabled !== false, hpThreshold: old.hpThreshold ?? 80, mpThreshold: old.mpThreshold ?? 20 };
  });
  next.statLibraries = ensureStatLibraries(next.library.stats);
  next.activeContent = saved.activeContent || next.activeContent;
  next.companionSlotCount = Math.max(1, Math.min(6, Number(saved.companionSlotCount) || 6));
  return next;
}
function loadState() {
  try { return migrateState(JSON.parse(localStorage.getItem(STORE) || 'null')); } catch { return defaultState(); }
}
let state = loadState();
let selectedId = state.activeContent || 'chapter-hunt';
function persist() {
  state.activeContent = selectedId;
  localStorage.setItem(STORE, JSON.stringify(state));
}
function slotsFor(type, contentId = selectedId) {
  if (type === 'stats') {
    if (!state.statLibraries) state.statLibraries = {};
    if (!state.statLibraries[contentId]) state.statLibraries[contentId] = cloneSlots(state.library?.stats || createLibrary().stats, 'stats');
    while (state.statLibraries[contentId].length < SLOT_COUNT) state.statLibraries[contentId].push(createSlot('stats', state.statLibraries[contentId].length));
    return state.statLibraries[contentId];
  }
  if (!state.library[type]) state.library[type] = createLibrary()[type];
  return state.library[type];
}
function slotFor(type, id, contentId = selectedId) {
  return slotsFor(type, contentId).find(slot => slot.id === id) || slotsFor(type, contentId)[0];
}
function assignmentsFor(id) {
  const current = state.assignments[id] || {};
  state.assignments[id] = { ...defaultAssignments(), ...current };
  COMPONENTS.forEach(([type]) => { if (!slotFor(type, state.assignments[id][type])) state.assignments[id][type] = `${type}-1`; });
  return state.assignments[id];
}
function settingsFor(id) {
  if (!state.contentSettings[id]) state.contentSettings[id] = { enabled: true, hpThreshold: 80, mpThreshold: 20 };
  return state.contentSettings[id];
}
function formSnapshot(fieldIds = null) {
  const snapshot = {};
  const selector = fieldIds ? fieldIds.map(id => `#${id}`).join(',') : '#characterForm input[id],#characterForm select[id],#targetForm input[id],#targetForm select[id],#cubeCost,#cubeProbability,#successRate,#attempts,#attemptCost';
  document.querySelectorAll(selector).forEach(el => { snapshot[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  return snapshot;
}
function applySnapshot(snapshot) {
  Object.entries(snapshot || {}).forEach(([id, value]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function statSummaryTag(slot) {
  const snap = slot?.snapshot;
  if (!snap) return '<span class="stat-summary-tag empty">미입력 (스탯 편집으로 입력)</span>';
  const parts = [];
  if (snap.attackFlat) parts.push(`공격력 ${Number(snap.attackFlat).toLocaleString()}`);
  if (snap.mainStat) parts.push(`주스탯 ${Number(snap.mainStat).toLocaleString()}`);
  if (snap.damage) parts.push(`데미지 ${snap.damage}%`);
  if (snap.bossDamage) parts.push(`보뎀 ${snap.bossDamage}%`);
  if (snap.critRate) parts.push(`크확 ${snap.critRate}%`);
  if (snap.defPen) parts.push(`관통 ${snap.defPen}%`);
  return parts.length ? `<span class="stat-summary-tag">${parts.join(' · ')}</span>` : '<span class="stat-summary-tag">내용 저장됨</span>';
}
function renderStatEditor(slot) {
  if (!slot) return '';
  const snap = slot.snapshot || {};
  return `
    <div class="stat-slot-editor">
      <div class="stat-slot-editor-heading">
        <div>
          <strong>${escapeHtml(slot.name)} 상세 스탯 직접 편집</strong>
          <p>이 슬롯의 스탯 수치를 직접 수정하거나 현재 폼에서 불러올 수 있습니다.</p>
        </div>
        <div class="stat-preset-quick-actions">
          <button type="button" class="button ghost" data-load-form-to-slot="${slot.id}">현재 폼 스탯 가져오기</button>
          <button type="button" class="button secondary" data-apply-slot="${slot.id}">이 스탯 적용 & 장착</button>
          <button type="button" class="button danger ghost" data-clear-slot="${slot.id}">초기화</button>
        </div>
      </div>
      <div class="stat-editor-grid">
        <label>공격력(+)<input data-stat-field="attackFlat" data-slot-id="${slot.id}" type="number" min="0" value="${snap.attackFlat ?? 0}"></label>
        <label>공격력%<input data-stat-field="attackPct" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.attackPct ?? 0}"></label>
        <label>주스탯(+)<input data-stat-field="mainStat" data-slot-id="${slot.id}" type="number" min="0" value="${snap.mainStat ?? 0}"></label>
        <label>주스탯%<input data-stat-field="mainStatPct" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.mainStatPct ?? 0}"></label>
        <label>부스탯(+)<input data-stat-field="subStat" data-slot-id="${slot.id}" type="number" min="0" value="${snap.subStat ?? 0}"></label>
        <label>데미지%<input data-stat-field="damage" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.damage ?? 0}"></label>
        <label>데미지 증폭%<input data-stat-field="damageAmp" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.damageAmp ?? 0}"></label>
        <label>최종 데미지%<input data-stat-field="finalDamage" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.finalDamage ?? 0}"></label>
        <label>보스 데미지%<input data-stat-field="bossDamage" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.bossDamage ?? 0}"></label>
        <label>일반 몬스터 데미지%<input data-stat-field="normalDamage" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.normalDamage ?? 0}"></label>
        <label>크리티컬 확률%<input data-stat-field="critRate" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.critRate ?? 0}"></label>
        <label>크리티컬 데미지%<input data-stat-field="critDamage" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.critDamage ?? 0}"></label>
        <label>방어 관통력%<input data-stat-field="defPen" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.defPen ?? 0}"></label>
        <label>공격 속도%<input data-stat-field="attackSpeed" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.attackSpeed ?? 0}"></label>
        <label>기본 공격 데미지%<input data-stat-field="basicDamage" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.basicDamage ?? 0}"></label>
        <label>스킬 데미지%<input data-stat-field="skillDamage" data-slot-id="${slot.id}" type="number" step="0.1" value="${snap.skillDamage ?? 0}"></label>
      </div>
    </div>
  `;
}
function runtimeJob() { return RUNTIME_JOB[$('job')?.value] || ''; }
function companionCandidates() { return companionRuntime?.supporters?.filter(item => !runtimeJob() || item.typeId === runtimeJob()) || []; }
function companionLabel(item) { return `${item.typeId || '동료'} · ${item.grade || '등급 미상'} · #${item.creatureIndex || item.supporterIndex}`; }
function companionEffect() {
  if (!companionRuntime) return null;
  const slot = slotFor('companion', assignmentsFor(selectedId).companion);
  const values = {};
  const members = [];
  (slot.members || []).slice(0, state.companionSlotCount || 6).forEach(member => {
    const supporter = companionRuntime.supporters?.find(item => item.supporterIndex === Number(member.supporterIndex));
    if (!supporter) return;
    const record = companionRuntime.equippedStats?.[`${supporter.typeId}:${supporter.grade}`];
    const maxLevel = record?.levels?.length || supporter.maxLevel || 1;
    const level = Math.max(1, Math.min(Number(member.level) || 1, maxLevel));
    const effect = record?.levels?.[level - 1] || {};
    Object.entries(effect).forEach(([key, value]) => { if (Number.isFinite(Number(value))) values[key] = (values[key] || 0) + Number(value); });
    members.push({ supporterIndex: supporter.supporterIndex, label: companionLabel(supporter), level, effect });
  });
  return members.length ? { level: '', grade: slot.name, record: null, values, members } : null;
}
function setTargetModeFromContent(id) {
  const content = contentById(id);
  if (!content) return;
  const stageModeEl = $('stageMode');
  const stageChapterEl = $('stageChapter');
  if (!stageModeEl) return;
  let targetMode = 'hunt';
  let targetChapter = '';

  if (id === 'chapter-hunt') { targetMode = 'hunt'; }
  else if (id === 'chapter-trial') { targetMode = 'trial'; }
  else if (id === 'chapter-boss') { targetMode = 'hunt'; if ($('targetType')) $('targetType').value = 'boss'; }
  else if (id === 'weapon-dungeon') { targetMode = 'growth_dungeon'; targetChapter = '무기 던전'; }
  else if (id === 'exp-dungeon') { targetMode = 'growth_dungeon'; targetChapter = '경험치 던전'; }
  else if (id === 'equipment-dungeon') { targetMode = 'growth_dungeon'; targetChapter = '장비 던전'; }
  else if (id === 'training-ground') { targetMode = 'growth_dungeon'; targetChapter = '용사의 수련장'; }
  else if (id === 'enhancement-dungeon') { targetMode = 'growth_dungeon'; targetChapter = '강화 던전'; }
  else if (id === 'world-boss') { targetMode = 'world_boss'; targetChapter = '월드 보스'; }
  else if (id === 'guild-battle') { targetMode = 'guild_content'; targetChapter = '길드 토벌전'; }
  else if (id === 'guild-war') { targetMode = 'guild_content'; targetChapter = '길드 대항전'; }
  else if (id === 'guild-raid-zakum') { targetMode = 'guild_content'; targetChapter = '길드 토벌전'; }
  else if (id === 'boss-raid') { targetMode = 'boss_raid'; }

  if (stageModeEl.value !== targetMode) {
    stageModeEl.value = targetMode;
    if (typeof window.fillStageChapters === 'function') window.fillStageChapters();
  }
  if (targetChapter && stageChapterEl) {
    stageChapterEl.value = targetChapter;
    if (typeof window.fillStages === 'function') window.fillStages();
  }
}

function exposeCompanionBridge() {
  window.MapleGrowthCompanion = { getEffect: companionEffect };
  window.MapleGrowthPresets = {
    activateContent,
    getCurrentContent: () => selectedId,
    getAssignedPresets: (id = selectedId) => {
      const assignments = assignmentsFor(id);
      return {
        stats: slotFor('stats', assignments.stats, id),
        skill: slotFor('skill', assignments.skill, id),
        companion: slotFor('companion', assignments.companion, id),
        relic: slotFor('relic', assignments.relic, id),
      };
    }
  };
  window.dispatchEvent(new Event('maple:presets-changed'));
}

function activateContent(id, { load = true, syncTarget = true } = {}) {
  selectedId = id;
  const content = contentById(id);
  const settings = settingsFor(id);
  const effectiveId = settings.enabled ? id : 'chapter-hunt';
  if (load && state.contentSnapshots[effectiveId]) applySnapshot(state.contentSnapshots[effectiveId]);
  const equippedStats = slotFor('stats', assignmentsFor(id).stats);
  if (load && equippedStats.snapshot) applySnapshot(equippedStats.snapshot);

  if (syncTarget) {
    setTargetModeFromContent(id);
  }
  if (content?.targetType && $('targetType')) {
    $('targetType').value = content.targetType;
  }
  persist();
  render();
  exposeCompanionBridge();
}
function slotOptions(type, selected) {
  return slotsFor(type).map(slot => `<option value="${slot.id}"${slot.id === selected ? ' selected' : ''}>${slot.name}</option>`).join('');
}
function renderTree() {
  return CONTENTS.map(group => `<div class="content-tree-group"><strong>${group.group}</strong>${group.items.map(item => `<button type="button" class="content-tree-item${item.id === selectedId ? ' active' : ''}" data-content-id="${item.id}">${item.label}</button>`).join('')}</div>`).join('');
}
function renderAssignments() {
  const assignments = assignmentsFor(selectedId);
  return COMPONENTS.map(([type, label]) => {
    const current = slotFor(type, assignments[type]);
    return `<div class="content-assignment-row"><label>${label} 프리셋<select data-assignment-type="${type}">${slotOptions(type, current.id)}</select></label><span class="assigned-slot-name">${current.name}</span><button type="button" class="button ghost" data-manage-type="${type}">슬롯 관리</button></div>`;
  }).join('');
}
function renderLibrary() {
  const type = state.activeLibraryType;
  const assignments = assignmentsFor(selectedId);
  const slots = slotsFor(type);
  const activeStatSlot = slotFor('stats', activeStatSlotId || assignments.stats);
  return `<div class="preset-library"><div class="preset-library-heading"><div><h3>${componentLabel(type)} 프리셋 슬롯</h3><p>${type === 'stats' ? '이 콘텐츠에만 적용되는 스탯 슬롯입니다. 다른 콘텐츠와 자동으로 공유되지 않습니다.' : '슬롯 이름은 자유롭게 바꿀 수 있습니다. 현재 콘텐츠에 장착된 슬롯은 표시됩니다.'}</p></div><button type="button" class="button secondary" id="addPresetSlot">슬롯 추가</button></div><div class="preset-type-tabs">${COMPONENTS.map(([id, label]) => `<button type="button" class="tab${id === type ? ' active' : ''}" data-library-type="${id}">${label}</button>`).join('')}</div><div class="preset-slot-list">${slots.map((slot, index) => { const equipped = assignments[type] === slot.id; const statActions = type === 'stats' ? `<button type="button" class="button secondary" data-edit-stat="${slot.id}">스탯 편집</button>` : ''; const companionAction = type === 'companion' ? `<button type="button" class="button ghost" data-edit-companion="${slot.id}">편집</button>` : ''; return `<div class="preset-slot-row${equipped ? ' equipped' : ''}"><span class="preset-slot-number">${index + 1}</span><div class="slot-info-col"><input data-slot-name="${slot.id}" value="${slot.name}" aria-label="${slot.name} 이름">${type === 'stats' ? statSummaryTag(slot) : ''}</div><span class="preset-slot-state">${equipped ? '현재 장착' : slot.snapshot ? '내용 저장됨' : '빈 슬롯'}</span>${statActions}${companionAction}<button type="button" class="button ${equipped ? 'secondary' : 'ghost'}" data-equip-slot="${slot.id}">${equipped ? '장착 중' : '장착'}</button></div>`; }).join('')}</div>${type === 'companion' ? renderCompanionEditor(slotFor('companion', activeCompanionSlotId || assignments.companion)) : type === 'stats' ? renderStatEditor(activeStatSlot) : ''}</div>`;
}
function render() {
  const root = $('contentPresetRoot');
  if (!root) return;
  const content = contentById(selectedId) || contentById('chapter-hunt');
  const settings = settingsFor(content.id);
  const snapshots = state.contentSnapshots[content.id];
  root.innerHTML = `
    <div class="content-preset-heading"><div><span class="step">02</span><div><h2 id="contentPresetHeading">콘텐츠 프리셋</h2><p>콘텐츠마다 여러 슬롯 중 원하는 스탯·스킬·동료·유물 프리셋을 장착합니다.</p></div></div><span class="badge official">브라우저에 자동 저장</span></div>
    <div class="content-preset-layout"><aside class="content-tree" aria-label="콘텐츠 선택">${renderTree()}</aside><div class="content-preset-editor">
      <div class="content-preset-title"><div><span class="content-parent">${CONTENTS.find(group => group.items.some(item => item.id === content.id))?.group || ''}</span><h3>${content.label}</h3></div><label class="content-toggle"><input id="contentPresetEnabled" type="checkbox"${settings.enabled ? ' checked' : ''}> 사용</label></div>
      <p class="hint">콘텐츠에 장착할 슬롯을 선택하세요. 별도 계산 입력을 저장하면 이 콘텐츠를 열 때 함께 불러옵니다.</p>
      <div class="content-assignment-list">${renderAssignments()}</div>
      <div class="fields compact content-threshold-fields"><label>HP 물약 자동 사용 기준%<input id="contentHpThreshold" type="number" min="0" max="100" step="1" value="${settings.hpThreshold}"></label><label>MP 물약 자동 사용 기준%<input id="contentMpThreshold" type="number" min="0" max="100" step="1" value="${settings.mpThreshold}"></label></div>
      <div class="content-preset-actions"><button type="button" class="button primary" id="saveContentPreset">현재 계산 입력 저장</button><select id="copyFromContent" aria-label="복사할 콘텐츠">${allContents().map(item => `<option value="${item.id}"${item.id === content.id ? ' disabled' : ''}>${item.label}</option>`).join('')}</select><button type="button" class="button secondary" id="copyContentPreset">다른 콘텐츠에서 복사</button><button type="button" class="button ghost" id="resetContentPreset">콘텐츠 설정 초기화</button></div>
      <div class="content-preset-status" aria-live="polite">${!settings.enabled ? '비활성화 상태 · 챕터 사냥 콘텐츠의 계산 입력을 사용합니다.' : snapshots ? '저장된 계산 입력이 있어 콘텐츠 선택 시 함께 적용됩니다.' : '저장된 계산 입력 없음 · 현재 캐릭터 입력을 유지합니다.'}</div>
      ${renderLibrary()}
    </div></div>`;
  root.querySelectorAll('[data-content-id]').forEach(button => button.addEventListener('click', () => activateContent(button.dataset.contentId)));
  root.querySelectorAll('[data-assignment-type]').forEach(select => select.addEventListener('change', event => { const type = event.target.dataset.assignmentType; assignmentsFor(selectedId)[type] = event.target.value; if (type === 'companion') activeCompanionSlotId = event.target.value; else if (type === 'stats') activeStatSlotId = event.target.value; persist(); render(); exposeCompanionBridge(); }));
  root.querySelectorAll('[data-manage-type]').forEach(button => button.addEventListener('click', () => { state.activeLibraryType = button.dataset.manageType; if (state.activeLibraryType === 'companion') activeCompanionSlotId = assignmentsFor(selectedId).companion; else if (state.activeLibraryType === 'stats') activeStatSlotId = assignmentsFor(selectedId).stats; persist(); render(); }));
  root.querySelectorAll('[data-library-type]').forEach(button => button.addEventListener('click', () => { state.activeLibraryType = button.dataset.libraryType; if (state.activeLibraryType === 'companion') activeCompanionSlotId = assignmentsFor(selectedId).companion; else if (state.activeLibraryType === 'stats') activeStatSlotId = assignmentsFor(selectedId).stats; persist(); render(); }));
  root.querySelectorAll('[data-slot-name]').forEach(input => input.addEventListener('change', event => { const slot = slotsFor(state.activeLibraryType).find(item => item.id === event.target.dataset.slotName); if (slot && event.target.value.trim()) { slot.name = event.target.value.trim(); persist(); render(); } }));
  root.querySelectorAll('[data-edit-companion]').forEach(button => button.addEventListener('click', () => { state.activeLibraryType = 'companion'; activeCompanionSlotId = button.dataset.editCompanion; persist(); render(); }));
  root.querySelectorAll('[data-auto-optimize-companion]').forEach(button => button.addEventListener('click', () => { const slot = slotFor('companion', button.dataset.autoOptimizeCompanion); const candidates = companionCandidates(); if (!candidates.length) return; const gradeRank = { legendary: 5, unique: 4, epic: 3, rare: 2, normal: 1 }; const sorted = [...candidates].sort((a, b) => (gradeRank[b.grade] || 0) - (gradeRank[a.grade] || 0)); const unlocked = Math.max(1, Math.min(6, Number(state.companionSlotCount) || 6)); slot.members = Array.from({ length: COMPANION_MEMBER_COUNT }, (_, index) => { if (index < unlocked && sorted[index]) { const record = companionRuntime.equippedStats?.[`${sorted[index].typeId}:${sorted[index].grade}`]; const maxLevel = record?.levels?.length || sorted[index].maxLevel || 1; return { supporterIndex: sorted[index].supporterIndex, level: maxLevel }; } return {}; }); persist(); render(); exposeCompanionBridge(); }));
  root.querySelectorAll('[data-edit-stat]').forEach(button => button.addEventListener('click', () => { state.activeLibraryType = 'stats'; activeStatSlotId = button.dataset.editStat; persist(); render(); }));

  root.querySelectorAll('[data-load-form-to-slot]').forEach(button => button.addEventListener('click', () => { const slot = slotFor('stats', button.dataset.loadFormToSlot); slot.snapshot = formSnapshot(STAT_FIELD_IDS); assignmentsFor(selectedId).stats = slot.id; activeStatSlotId = slot.id; persist(); render(); exposeCompanionBridge(); }));
  root.querySelectorAll('[data-clear-slot]').forEach(button => button.addEventListener('click', () => { const slot = slotFor('stats', button.dataset.clearSlot); slot.snapshot = null; persist(); render(); }));
  root.querySelectorAll('[data-stat-field]').forEach(input => input.addEventListener('input', event => { const slotId = event.target.dataset.slotId; const slot = slotFor('stats', slotId); if (!slot.snapshot) slot.snapshot = formSnapshot(STAT_FIELD_IDS); slot.snapshot[event.target.dataset.statField] = event.target.value; const equipped = assignmentsFor(selectedId).stats === slot.id; if (equipped) applySnapshot(slot.snapshot); persist(); }));
  root.querySelectorAll('[data-companion-supporter]').forEach(select => select.addEventListener('change', event => { const slot = slotFor('companion', activeCompanionSlotId || assignmentsFor(selectedId).companion); const index = Number(event.target.dataset.companionSupporter); slot.members[index] = { supporterIndex: Number(event.target.value) || null, level: 1 }; persist(); render(); exposeCompanionBridge(); }));
  root.querySelectorAll('[data-companion-level]').forEach(input => input.addEventListener('input', event => { const slot = slotFor('companion', activeCompanionSlotId || assignmentsFor(selectedId).companion); const index = Number(event.target.dataset.companionLevel); slot.members[index] = { ...(slot.members[index] || {}), level: Number(event.target.value) || 1 }; persist(); exposeCompanionBridge(); }));
  $('companionUnlockedCount')?.addEventListener('change', event => { state.companionSlotCount = Math.max(1, Math.min(6, Number(event.target.value) || 6)); persist(); render(); exposeCompanionBridge(); });
  root.querySelectorAll('[data-equip-slot]').forEach(button => button.addEventListener('click', () => { const type = state.activeLibraryType; const slot = slotFor(type, button.dataset.equipSlot); assignmentsFor(selectedId)[type] = slot.id; if (type === 'companion') activeCompanionSlotId = slot.id; else if (type === 'stats') { activeStatSlotId = slot.id; if (slot.snapshot) applySnapshot(slot.snapshot); } persist(); render(); exposeCompanionBridge(); }));
  root.querySelectorAll('[data-save-slot]').forEach(button => button.addEventListener('click', () => { const slot = slotFor('stats', button.dataset.saveSlot); slot.snapshot = formSnapshot(STAT_FIELD_IDS); assignmentsFor(selectedId).stats = slot.id; activeStatSlotId = slot.id; persist(); render(); }));
  root.querySelectorAll('[data-apply-slot]').forEach(button => button.addEventListener('click', () => { const slot = slotFor('stats', button.dataset.applySlot); if (slot.snapshot) applySnapshot(slot.snapshot); assignmentsFor(selectedId).stats = slot.id; activeStatSlotId = slot.id; persist(); render(); }));
  $('addPresetSlot')?.addEventListener('click', () => { const slots = slotsFor(state.activeLibraryType); slots.push(createSlot(state.activeLibraryType, slots.length)); persist(); render(); });
  $('contentPresetEnabled')?.addEventListener('change', event => { settings.enabled = event.target.checked; persist(); render(); });
  $('contentHpThreshold')?.addEventListener('input', event => { settings.hpThreshold = Number(event.target.value) || 0; persist(); });
  $('contentMpThreshold')?.addEventListener('input', event => { settings.mpThreshold = Number(event.target.value) || 0; persist(); });
  $('saveContentPreset')?.addEventListener('click', () => { state.contentSnapshots[selectedId] = formSnapshot(); settings.enabled = true; persist(); render(); });
  $('copyContentPreset')?.addEventListener('click', () => { const source = $('copyFromContent')?.value; if (!source || !contentById(source)) return; state.assignments[selectedId] = { ...assignmentsFor(source) }; state.statLibraries[selectedId] = cloneSlots(slotsFor('stats', source), 'stats'); state.contentSnapshots[selectedId] = state.contentSnapshots[source] ? JSON.parse(JSON.stringify(state.contentSnapshots[source])) : null; const sourceSettings = settingsFor(source); settings.hpThreshold = sourceSettings.hpThreshold; settings.mpThreshold = sourceSettings.mpThreshold; settings.enabled = true; persist(); render(); });
  $('resetContentPreset')?.addEventListener('click', () => { if (!confirm(`${content.label} 설정을 초기화할까요?`)) return; delete state.assignments[content.id]; delete state.statLibraries[content.id]; delete state.contentSnapshots[content.id]; delete state.contentSettings[content.id]; persist(); render(); });
}
async function init() {
  if (!$('contentPresetRoot')) return;
  render();
  const originalLabel = $('activePresetLabel');
  if (originalLabel) originalLabel.title = '상단 프리셋은 전체 계산 입력, 콘텐츠 프리셋은 세부 콘텐츠별 적용 설정입니다.';
  $('job')?.addEventListener('input', () => { if (state.activeLibraryType === 'companion') render(); exposeCompanionBridge(); });
  try {
    companionRuntime = await fetch('data/companion-runtime-data.json').then(response => response.json());
    render();
    exposeCompanionBridge();
  } catch (error) {
    console.warn('동료 런타임 데이터를 불러오지 못했습니다.', error);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
