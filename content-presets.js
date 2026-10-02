'use strict';

// Content-specific preset assignments. The existing character preset remains
// available; this layer decides which saved calculation state is used for each
// game content and keeps the many sub-content entries data-driven.
const STORE = 'maple-growth-lab-mvp-v1-content-presets';
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
  ['equipment', '장비'],
  ['skill', '스킬'],
  ['companion', '동료'],
  ['ability', '어빌리티'],
  ['relic', '유물'],
];
const PRESET_OPTIONS = [
  ['basic', '기본 프리셋'],
  ['hunt', '사냥 프리셋'],
  ['trial', '도전 프리셋'],
  ['boss', '보스 프리셋'],
  ['pvp', 'PvP 프리셋'],
  ['custom', '커스텀 프리셋'],
];
const $ = id => document.getElementById(id);
const allContents = () => CONTENTS.flatMap(group => group.items);
const contentById = id => allContents().find(item => item.id === id);
const defaultKind = content => {
  if (content.targetType === 'pvp') return 'pvp';
  if (content.targetType === 'boss' || content.id.includes('boss') || content.id.includes('raid') || content.id.includes('guild-')) return 'boss';
  if (content.stageMode === 'trial' || content.id.includes('challenge') || content.id.includes('training')) return 'trial';
  return 'hunt';
};
const defaultRecord = content => {
  const kind = defaultKind(content);
  return {
    enabled: true,
    components: Object.fromEntries(COMPONENTS.map(([id]) => [id, kind])),
    hpThreshold: 80,
    mpThreshold: 20,
    snapshot: null,
  };
};
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.records) return saved;
  } catch {}
  return { activeContent: 'chapter-hunt', records: {} };
}
let state = loadState();
let selectedId = state.activeContent || 'chapter-hunt';
function recordFor(id) {
  const content = contentById(id) || contentById('chapter-hunt');
  if (!state.records[id]) state.records[id] = defaultRecord(content);
  const record = state.records[id];
  record.components = { ...defaultRecord(content).components, ...(record.components || {}) };
  return record;
}
function persist() {
  state.activeContent = selectedId;
  localStorage.setItem(STORE, JSON.stringify(state));
}
function formSnapshot() {
  const snapshot = {};
  document.querySelectorAll('input[id],select[id]').forEach(el => {
    if (['presetName', 'presetSelect'].includes(el.id)) return;
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
  const record = recordFor(id);
  const sourceRecord = record.enabled ? record : recordFor('chapter-hunt');
  if (load && sourceRecord.snapshot) applySnapshot(sourceRecord.snapshot);
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
function optionMarkup(selected) {
  return PRESET_OPTIONS.map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('');
}
function renderTree() {
  return CONTENTS.map(group => `<div class="content-tree-group"><strong>${group.group}</strong>${group.items.map(item => `<button type="button" class="content-tree-item${item.id === selectedId ? ' active' : ''}" data-content-id="${item.id}">${item.label}</button>`).join('')}</div>`).join('');
}
function render() {
  const root = $('contentPresetRoot');
  if (!root) return;
  const content = contentById(selectedId) || contentById('chapter-hunt');
  const record = recordFor(content.id);
  root.innerHTML = `
    <div class="content-preset-heading">
      <div><span class="step">02</span><div><h2 id="contentPresetHeading">콘텐츠 프리셋</h2><p>세부 콘텐츠마다 장비·스킬·동료·어빌리티·유물 조합을 따로 지정합니다.</p></div></div>
      <span class="badge official">브라우저에 자동 저장</span>
    </div>
    <div class="content-preset-layout">
      <aside class="content-tree" aria-label="콘텐츠 선택">${renderTree()}</aside>
      <div class="content-preset-editor">
        <div class="content-preset-title"><div><span class="content-parent">${CONTENTS.find(group => group.items.some(item => item.id === content.id))?.group || ''}</span><h3>${content.label}</h3></div><label class="content-toggle"><input id="contentPresetEnabled" type="checkbox"${record.enabled ? ' checked' : ''}> 사용</label></div>
        <p class="hint">이 콘텐츠를 계산 대상으로 선택하면 아래 조합을 적용합니다. 저장하지 않은 항목은 기본 프리셋을 사용합니다.</p>
        <div class="fields compact content-preset-fields">${COMPONENTS.map(([id, label]) => `<label>${label} 프리셋<select data-component="${id}">${optionMarkup(record.components[id])}</select></label>`).join('')}</div>
        <div class="fields compact content-threshold-fields">
          <label>HP 물약 자동 사용 기준%<input id="contentHpThreshold" type="number" min="0" max="100" step="1" value="${record.hpThreshold}"></label>
          <label>MP 물약 자동 사용 기준%<input id="contentMpThreshold" type="number" min="0" max="100" step="1" value="${record.mpThreshold}"></label>
        </div>
        <div class="content-preset-actions"><button type="button" class="button primary" id="saveContentPreset">현재 입력을 이 콘텐츠에 저장</button><select id="copyFromContent" aria-label="복사할 콘텐츠">${allContents().map(item => `<option value="${item.id}"${item.id === content.id ? ' disabled' : ''}>${item.label}</option>`).join('')}</select><button type="button" class="button secondary" id="copyContentPreset">선택한 콘텐츠에서 복사</button><button type="button" class="button ghost" id="resetContentPreset">콘텐츠 설정 초기화</button></div>
        <div class="content-preset-status" aria-live="polite">${!record.enabled ? '비활성화 상태 · 챕터 사냥 프리셋 조합을 사용합니다.' : record.snapshot ? '저장된 계산 입력이 있어 콘텐츠 선택 시 함께 적용됩니다.' : '저장된 계산 입력 없음 · 현재 캐릭터 프리셋을 사용합니다.'}</div>
      </div>
    </div>`;
  root.querySelectorAll('[data-content-id]').forEach(button => button.addEventListener('click', () => activateContent(button.dataset.contentId)));
  root.querySelectorAll('[data-component]').forEach(select => select.addEventListener('change', () => { record.components[select.dataset.component] = select.value; persist(); }));
  $('contentPresetEnabled')?.addEventListener('change', event => { record.enabled = event.target.checked; persist(); });
  $('contentHpThreshold')?.addEventListener('input', event => { record.hpThreshold = Number(event.target.value) || 0; persist(); });
  $('contentMpThreshold')?.addEventListener('input', event => { record.mpThreshold = Number(event.target.value) || 0; persist(); });
  $('saveContentPreset')?.addEventListener('click', () => { record.snapshot = formSnapshot(); record.enabled = true; persist(); render(); });
  $('copyContentPreset')?.addEventListener('click', () => {
    const source = $('copyFromContent')?.value;
    if (!source || !contentById(source)) return;
    const sourceRecord = recordFor(source);
    record.components = { ...sourceRecord.components };
    record.hpThreshold = sourceRecord.hpThreshold;
    record.mpThreshold = sourceRecord.mpThreshold;
    record.snapshot = sourceRecord.snapshot ? JSON.parse(JSON.stringify(sourceRecord.snapshot)) : null;
    persist();
    render();
  });
  $('resetContentPreset')?.addEventListener('click', () => {
    if (!confirm(`${content.label} 설정을 초기화할까요?`)) return;
    state.records[content.id] = defaultRecord(content);
    persist();
    render();
  });
}
function init() {
  if (!$('contentPresetRoot')) return;
  render();
  const originalLabel = $('activePresetLabel');
  if (originalLabel) originalLabel.title = '상단 프리셋은 전체 계산 입력, 콘텐츠 프리셋은 세부 콘텐츠별 적용 설정입니다.';
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
