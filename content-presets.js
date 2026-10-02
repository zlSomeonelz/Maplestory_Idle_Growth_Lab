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
  return { id: `${type}-${index + 1}`, name: `${index + 1}번 프리셋`, snapshot: null };
}
function createLibrary() {
  return Object.fromEntries(COMPONENTS.map(([type]) => [type, Array.from({ length: SLOT_COUNT }, (_, index) => createSlot(type, index))]));
}
function defaultAssignments() {
  return Object.fromEntries(COMPONENTS.map(([type]) => [type, `${type}-1`]));
}
function defaultState() {
  return { activeContent: 'chapter-hunt', activeLibraryType: 'stats', library: createLibrary(), assignments: {}, contentSnapshots: {}, contentSettings: {} };
}
function migrateState(saved) {
  const next = defaultState();
  if (!saved || typeof saved !== 'object') return next;
  if (saved.library && saved.assignments) {
    const oldTypeFor = type => type === 'stats' ? (saved.library.stats || saved.library.ability || saved.library.equipment) : saved.library[type];
    const normalizeSlots = (type, oldSlots) => {
      const source = Array.isArray(oldSlots) ? oldSlots : [];
      const slots = source.map((slot, index) => ({ ...createSlot(type, index), ...slot, id: `${type}-${index + 1}` }));
      while (slots.length < SLOT_COUNT) slots.push(createSlot(type, slots.length));
      return slots;
    };
    next.library = Object.fromEntries(COMPONENTS.map(([type]) => [type, normalizeSlots(type, oldTypeFor(type))]));
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
    return next;
  }
  // Preserve the previous 1차 content settings where possible.
  Object.entries(saved.records || {}).forEach(([contentId, old]) => {
    next.assignments[contentId] = defaultAssignments();
    next.contentSnapshots[contentId] = old.snapshot || null;
    next.contentSettings[contentId] = { enabled: old.enabled !== false, hpThreshold: old.hpThreshold ?? 80, mpThreshold: old.mpThreshold ?? 20 };
  });
  next.activeContent = saved.activeContent || next.activeContent;
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
function slotsFor(type) {
  if (!state.library[type]) state.library[type] = createLibrary()[type];
  return state.library[type];
}
function slotFor(type, id) {
  return slotsFor(type).find(slot => slot.id === id) || slotsFor(type)[0];
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
function formSnapshot() {
  const snapshot = {};
  document.querySelectorAll('#characterForm input[id],#characterForm select[id],#targetForm input[id],#targetForm select[id],#cubeCost,#cubeProbability,#successRate,#attempts,#attemptCost').forEach(el => {
    snapshot[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
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
function activateContent(id, { load = true } = {}) {
  selectedId = id;
  const content = contentById(id);
  const settings = settingsFor(id);
  const effectiveId = settings.enabled ? id : 'chapter-hunt';
  if (load && state.contentSnapshots[effectiveId]) applySnapshot(state.contentSnapshots[effectiveId]);
  if (content?.stageMode && $('stageMode')) {
    $('stageMode').value = content.stageMode;
    $('stageMode').dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (content?.targetType && $('targetType')) {
    $('targetType').value = content.targetType;
    $('targetType').dispatchEvent(new Event('input', { bubbles: true }));
  }
  persist();
  render();
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
  return `<div class="preset-library"><div class="preset-library-heading"><div><h3>${componentLabel(type)} 프리셋 슬롯</h3><p>슬롯 이름은 자유롭게 바꿀 수 있습니다. 현재 콘텐츠에 장착된 슬롯은 표시됩니다.</p></div><button type="button" class="button secondary" id="addPresetSlot">슬롯 추가</button></div><div class="preset-type-tabs">${COMPONENTS.map(([id, label]) => `<button type="button" class="tab${id === type ? ' active' : ''}" data-library-type="${id}">${label}</button>`).join('')}</div><div class="preset-slot-list">${slots.map((slot, index) => { const equipped = assignments[type] === slot.id; return `<div class="preset-slot-row${equipped ? ' equipped' : ''}"><span class="preset-slot-number">${index + 1}</span><input data-slot-name="${slot.id}" value="${slot.name}" aria-label="${slot.name} 이름"><span class="preset-slot-state">${equipped ? '현재 장착' : slot.snapshot ? '내용 저장됨' : '빈 슬롯'}</span><button type="button" class="button ${equipped ? 'secondary' : 'ghost'}" data-equip-slot="${slot.id}">${equipped ? '장착 중' : '장착'}</button></div>`; }).join('')}</div></div>`;
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
  root.querySelectorAll('[data-assignment-type]').forEach(select => select.addEventListener('change', event => { assignmentsFor(selectedId)[event.target.dataset.assignmentType] = event.target.value; persist(); render(); }));
  root.querySelectorAll('[data-manage-type]').forEach(button => button.addEventListener('click', () => { state.activeLibraryType = button.dataset.manageType; persist(); render(); }));
  root.querySelectorAll('[data-library-type]').forEach(button => button.addEventListener('click', () => { state.activeLibraryType = button.dataset.libraryType; persist(); render(); }));
  root.querySelectorAll('[data-slot-name]').forEach(input => input.addEventListener('change', event => { const slot = slotsFor(state.activeLibraryType).find(item => item.id === event.target.dataset.slotName); if (slot && event.target.value.trim()) { slot.name = event.target.value.trim(); persist(); render(); } }));
  root.querySelectorAll('[data-equip-slot]').forEach(button => button.addEventListener('click', () => { assignmentsFor(selectedId)[state.activeLibraryType] = button.dataset.equipSlot; persist(); render(); }));
  $('addPresetSlot')?.addEventListener('click', () => { const slots = slotsFor(state.activeLibraryType); slots.push(createSlot(state.activeLibraryType, slots.length)); persist(); render(); });
  $('contentPresetEnabled')?.addEventListener('change', event => { settings.enabled = event.target.checked; persist(); render(); });
  $('contentHpThreshold')?.addEventListener('input', event => { settings.hpThreshold = Number(event.target.value) || 0; persist(); });
  $('contentMpThreshold')?.addEventListener('input', event => { settings.mpThreshold = Number(event.target.value) || 0; persist(); });
  $('saveContentPreset')?.addEventListener('click', () => { state.contentSnapshots[selectedId] = formSnapshot(); settings.enabled = true; persist(); render(); });
  $('copyContentPreset')?.addEventListener('click', () => { const source = $('copyFromContent')?.value; if (!source || !contentById(source)) return; state.assignments[selectedId] = { ...assignmentsFor(source) }; state.contentSnapshots[selectedId] = state.contentSnapshots[source] ? JSON.parse(JSON.stringify(state.contentSnapshots[source])) : null; const sourceSettings = settingsFor(source); settings.hpThreshold = sourceSettings.hpThreshold; settings.mpThreshold = sourceSettings.mpThreshold; settings.enabled = true; persist(); render(); });
  $('resetContentPreset')?.addEventListener('click', () => { if (!confirm(`${content.label} 설정을 초기화할까요?`)) return; delete state.assignments[content.id]; delete state.contentSnapshots[content.id]; delete state.contentSettings[content.id]; persist(); render(); });
}
function init() {
  if (!$('contentPresetRoot')) return;
  render();
  const originalLabel = $('activePresetLabel');
  if (originalLabel) originalLabel.title = '상단 프리셋은 전체 계산 입력, 콘텐츠 프리셋은 세부 콘텐츠별 적용 설정입니다.';
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
