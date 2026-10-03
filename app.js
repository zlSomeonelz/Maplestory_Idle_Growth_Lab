import { calculateCombatPower, calculateDamage, calculatePvpDamage, calculateStatEfficiencies, cubeTargetSummary, probabilitySummary } from './engine.mjs';
import { buildSkillModels, optimizeLoadout, simulateLoadout, DEFAULT_UNKNOWN_COOLDOWN, LOADOUT_SKILL_SLOTS } from './skill-optimizer.mjs';
import { calculateStarforcePath, calculateScrollEnhancement, optimizeSpecUpPath, STARFORCE_MAX } from './enhancement-engine.mjs';
'use strict';

const STORE = 'maple-growth-lab-mvp-v1';
const BUILD_PRESET_KEY = 'maple-growth-lab-build-presets-v01';
const CLOUD_RESTORED_KEY = 'maple-growth-lab-cloud-restored-at';
const SUPABASE_URL = 'https://hggyxvspvpmqfnajoefn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jUcqPPHM3UGLPvv72uzueQ_s4qJmFMT';

const cloudClient = (typeof window !== 'undefined' && window.supabase?.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

let cloudSession = null;
let cloudRestoreCheckedForUser = null;
let cloudSaveTimer = null;

const DATA = {
  combat: null,
  stats: null,
  jobs: null,
  probabilities: null,
  potentialProbabilities: null,
  companionRuntime: null,
  companionRules: null,
  stageData: null,
  bossData: null,
  growthDungeonData: null,
  guildData: null,
  dropTableData: null,
  enhancementRules: null
};

let communityGuide = null;
let ownedCompanions = [];
let companionDatabase = { equippedStats: {}, supporters: [], skillsById: {}, jobLabels: {}, gradeLabels: {}, source: null };
let savedCompanionSlots = [];
const COMPANION_SLOT_COUNT = 7;

const JOB_NAMES = {
  hero: '히어로',
  paladin: '팔라딘',
  darkKnight: '다크나이트',
  archMageIceLightning: '아크메이지(썬·콜)',
  archMageFirePoison: '아크메이지(불·독)',
  bishop: '비숍',
  bowmaster: '보우마스터',
  sniper: '신궁',
  nightLord: '나이트로드',
  shadower: '섀도어',
  viper: '바이퍼',
  captain: '캡틴',
  nightWalker: '나이트워커',
  windBreaker: '윈드브레이커'
};

const RUNTIME_JOB = {
  hero: 'hero',
  paladin: 'paladin',
  darkKnight: 'dark-knight',
  archMageIceLightning: 'archmage-il',
  archMageFirePoison: 'archmage-fp',
  bishop: 'bishop',
  bowmaster: 'bowmaster',
  sniper: 'marksman',
  nightLord: 'night-lord',
  shadower: 'shadower',
  viper: 'viper',
  captain: 'captain',
  nightWalker: 'night-walker',
  windBreaker: 'wind-breaker'
};

const EFFECT_LABEL = {
  attackPlus: '공격력(+) ',
  maxDamage: '최대 데미지%',
  bossDamage: '보스 데미지%',
  normalDamage: '일반 몬스터 데미지%',
  basicDamage: '기본 공격 데미지%',
  skillDamage: '스킬 데미지%',
  attackSpeed: '공격 속도%',
  critRate: '크리티컬 확률%',
  critDamage: '크리티컬 데미지%',
  minDamage: '최소 데미지 배율%',
  mainPct: '주스탯%'
};

const STAT_OPTIONS = [
  ['NONE', '없음'],
  ['ATK_FLAT', '공격력(+)'],
  ['ATK_PCT', '공격력%'],
  ['MAIN_STAT_FLAT', '주스탯(+)'],
  ['MAIN_STAT_PCT', '주스탯%'],
  ['SUB_STAT_FLAT', '부스탯(+)'],
  ['SUB_STAT_PCT', '부스탯%'],
  ['MAX_HP', '최대 HP(+)'],
  ['PLAYER_DEFENSE', '방어력(+)'],
  ['MAX_MP', '최대 MP(+)'],
  ['FIXED_CDR', '쿨타임 감소(초)'],
  ['COOLDOWN_PCT', '쿨타임 감소%'],
  ['DMG', '데미지%'],
  ['DMG_AMP', '데미지 증폭%'],
  ['FINAL_DMG', '최종 데미지%'],
  ['BOSS_DMG', '보스 데미지%'],
  ['NORMAL_DMG', '일반 몬스터 데미지%'],
  ['DEF_PEN', '방어 관통력%'],
  ['CRIT_RATE', '크리티컬 확률%'],
  ['CRIT_DMG', '크리티컬 데미지%'],
  ['MIN_DAMAGE', '최소 데미지 배율%'],
  ['MAX_DAMAGE', '최대 데미지 배율%'],
  ['ATK_BASIC_DMG', '기본 공격 데미지%'],
  ['SKILL_DMG', '스킬 데미지%'],
  ['BUFF_DURATION', '버프 지속시간%'],
  ['COMPANION_DURATION', '동료 소환 지속시간%'],
  ['TARGET_COUNT_INC', '기본 공격 대상 수(+)'],
  ['ALL_SKILL_LEVEL', '모든 스킬 레벨(+)']
];

const $ = id => document.getElementById(id);
const n = id => Number($(id)?.value || 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pct = v => 1 + Number(v || 0) / 100;
const fmt = v => Number.isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function setStatus(text, kind = '') {
  const el = $('dataStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-strip ' + kind;
}

/* ==========================================================================
   Cloud Sync & Authentication (Supabase)
   ========================================================================== */

function cloudSetStatus(text, kind = '') {
  const e = $('cloudStatus');
  if (!e) return;
  e.textContent = text;
  e.className = 'small ' + (kind ? 'verdict ' + kind : '');
}

function parseLocalJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function cloudSnapshot() {
  return {
    user_id: cloudSession?.user?.id,
    state: snapshot(),
    companion_inventory: parseLocalJson('maple-growth-lab-companion-inventory', {}),
    detailed_stats: parseLocalJson('maple-growth-lab-detailed-stats', {}),
    build_presets: parseLocalJson(BUILD_PRESET_KEY, {}),
    preset_ocr: parseLocalJson('maple-growth-lab-preset-ocr-v01', {}),
    updated_at: new Date().toISOString()
  };
}

function openCloudModal() {
  if (cloudSession) return;
  const modal = $('cloudLoginModal');
  if (modal) modal.hidden = false;
  setTimeout(() => $('cloudEmail')?.focus(), 0);
}

function closeCloudModal() {
  const modal = $('cloudLoginModal');
  if (modal) modal.hidden = true;
}

function renderCloudAuth() {
  const logged = Boolean(cloudSession);
  const email = cloudSession?.user?.email || '';
  if ($('cloudAccountLabel')) $('cloudAccountLabel').textContent = logged ? `${email} 로그인됨` : '브라우저 저장 모드';
  if ($('cloudOpenBtn')) $('cloudOpenBtn').hidden = logged;
  if ($('cloudEmail')) {
    $('cloudEmail').value = logged ? email : $('cloudEmail').value;
    $('cloudEmail').disabled = logged;
  }
  if ($('cloudLoginBtn')) $('cloudLoginBtn').hidden = logged;
  if ($('cloudGoogleBtn')) $('cloudGoogleBtn').hidden = logged;
  if ($('cloudLogoutBtn')) $('cloudLogoutBtn').hidden = !logged;
  if ($('cloudLoadBtn')) $('cloudLoadBtn').hidden = !logged;
  if ($('cloudSaveBtn')) $('cloudSaveBtn').hidden = !logged;

  if (logged) {
    closeCloudModal();
    cloudSetStatus('클라우드 자동 저장·불러오기가 켜져 있습니다.', 'good');
    if (cloudRestoreCheckedForUser !== cloudSession.user.id) {
      setTimeout(maybeCloudRestore, 0);
    }
  } else {
    cloudRestoreCheckedForUser = null;
    cloudSetStatus('로그인하지 않으면 이 브라우저에만 저장됩니다.');
  }
}

async function cloudLogin() {
  if (!cloudClient) {
    cloudSetStatus('Supabase 클라이언트를 불러오지 못했습니다. 인터넷 연결을 확인하세요.', 'bad');
    return;
  }
  const email = $('cloudEmail')?.value.trim();
  if (!email) {
    cloudSetStatus('이메일을 먼저 입력하세요.', 'warn');
    return;
  }
  const redirectTo = location.href.split('#')[0];
  cloudSetStatus('로그인 링크를 보내는 중...');
  const { error } = await cloudClient.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  cloudSetStatus(error ? `로그인 링크를 보내지 못했습니다: ${error.message}` : '이메일로 로그인 링크를 보냈습니다. 메일의 링크를 눌러 돌아오세요.', error ? 'bad' : 'good');
}

async function cloudGoogleLogin() {
  if (!cloudClient) {
    cloudSetStatus('Supabase 클라이언트를 불러오지 못했습니다. 인터넷 연결을 확인하세요.', 'bad');
    return;
  }
  const redirectTo = location.href.split('#')[0];
  cloudSetStatus('Google 로그인 화면으로 이동합니다...');
  const { error } = await cloudClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) cloudSetStatus(`Google 로그인에 실패했습니다: ${error.message}`, 'bad');
}

function queueCloudSave() {
  if (!cloudSession) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => cloudSave(true), 900);
}

async function cloudSave(silent = false) {
  if (!cloudSession) {
    if (!silent) cloudSetStatus('먼저 로그인하세요.', 'warn');
    return;
  }
  clearTimeout(cloudSaveTimer);
  const payload = cloudSnapshot();
  const { error } = await cloudClient.from('maple_growth_user_data').upsert(payload, { onConflict: 'user_id' });
  if (!error) localStorage.setItem(CLOUD_RESTORED_KEY, payload.updated_at);
  if (!silent || error) {
    cloudSetStatus(error ? `클라우드 저장 실패: ${error.message}` : `변경 내용을 클라우드에 자동 저장했습니다 · ${new Date().toLocaleString('ko-KR')}`, error ? 'bad' : 'good');
  }
}

function applyCloudData(data) {
  if (data.state) {
    localStorage.setItem(STORE, JSON.stringify(data.state));
    applySnapshot(data.state);
  }
  if (data.companion_inventory) {
    localStorage.setItem('maple-growth-lab-companion-inventory', JSON.stringify(data.companion_inventory));
    loadOcrCompanions();
  }
  if (data.build_presets) {
    localStorage.setItem(BUILD_PRESET_KEY, JSON.stringify(data.build_presets));
    renderBuildPresets();
  }
  if (data.detailed_stats) {
    localStorage.setItem('maple-growth-lab-detailed-stats', JSON.stringify(data.detailed_stats));
  }
  if (data.preset_ocr) {
    localStorage.setItem('maple-growth-lab-preset-ocr-v01', JSON.stringify(data.preset_ocr));
  }
  localStorage.setItem(CLOUD_RESTORED_KEY, data.updated_at || '');
}

function hasLocalData() {
  return [STORE, 'maple-growth-lab-companion-inventory', 'maple-growth-lab-detailed-stats', BUILD_PRESET_KEY, 'maple-growth-lab-preset-ocr-v01'].some(key => {
    try { return Object.keys(JSON.parse(localStorage.getItem(key) || '{}')).length > 0; }
    catch { return false; }
  });
}

async function fetchCloudData() {
  if (!cloudSession) return null;
  const { data, error } = await cloudClient.from('maple_growth_user_data')
    .select('state,companion_inventory,detailed_stats,build_presets,preset_ocr,updated_at')
    .eq('user_id', cloudSession.user.id)
    .maybeSingle();
  if (error) {
    cloudSetStatus(`클라우드 데이터를 읽지 못했습니다: ${error.message}`, 'bad');
    return null;
  }
  return data;
}

async function maybeCloudRestore() {
  if (!cloudSession || cloudRestoreCheckedForUser === cloudSession.user.id) return;
  cloudRestoreCheckedForUser = cloudSession.user.id;
  const data = await fetchCloudData();
  if (!data) {
    if (hasLocalData()) {
      cloudSetStatus('클라우드 데이터가 없어 현재 브라우저 입력을 자동 저장합니다.', 'warn');
      await cloudSave(true);
    } else {
      cloudSetStatus('저장된 클라우드 데이터가 없습니다.', 'warn');
    }
    return;
  }
  if (localStorage.getItem(CLOUD_RESTORED_KEY) === data.updated_at) {
    cloudSetStatus('클라우드 데이터와 자동 동기화되어 있습니다.', 'good');
    return;
  }
  applyCloudData(data);
  cloudSetStatus(`클라우드 데이터를 자동 복원했습니다 · ${new Date(data.updated_at).toLocaleString('ko-KR')}`, 'good');
}

async function cloudLoad() {
  if (!cloudSession) {
    cloudSetStatus('먼저 로그인하세요.', 'warn');
    return;
  }
  const data = await fetchCloudData();
  if (!data) {
    cloudSetStatus('이 계정에 저장된 클라우드 데이터가 없습니다.', 'warn');
    return;
  }
  applyCloudData(data);
  cloudSetStatus('클라우드 데이터를 복원했습니다.', 'good');
}

async function cloudLogout() {
  clearTimeout(cloudSaveTimer);
  if (cloudClient) await cloudClient.auth.signOut();
  cloudSession = null;
  cloudRestoreCheckedForUser = null;
  closeCloudModal();
  renderCloudAuth();
}

async function initCloud() {
  if (!cloudClient) {
    cloudSetStatus('Supabase 클라이언트를 불러오지 못했습니다.');
    return;
  }
  try {
    const { data } = await cloudClient.auth.getSession();
    cloudSession = data?.session || null;
    renderCloudAuth();
    cloudClient.auth.onAuthStateChange((_event, session) => {
      cloudSession = session;
      renderCloudAuth();
    });
  } catch (err) {
    cloudSetStatus('클라우드 세션 확인 중 오류: ' + err.message);
  }
}

/* ==========================================================================
   Local Storage & Profiles
   ========================================================================== */

function snapshot() {
  const out = {};
  document.querySelectorAll('input[id],select[id]').forEach(el => {
    if (['presetName', 'presetSelect', 'buildPresetName', 'buildPresetSelect'].includes(el.id)) return;
    out[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  out.companionSlots = readCompanionSlots();
  return out;
}

function applySnapshot(s) {
  if (!s) return;
  Object.entries(s).forEach(([id, v]) => {
    if (id === 'companionSlots') {
      savedCompanionSlots = Array.isArray(v) ? v : [];
      return;
    }
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else el.value = v;
  });
  if (savedCompanionSlots.length) {
    renderCompanionSlots();
  }
  renderAll();
}

function saveLocal() {
  localStorage.setItem(STORE, JSON.stringify(snapshot()));
  queueCloudSave();
}

function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) applySnapshot(s);
  } catch {}
}

function profiles() {
  try { return JSON.parse(localStorage.getItem(STORE + '-profiles') || '{}'); }
  catch { return {}; }
}

function saveProfiles(p) {
  localStorage.setItem(STORE + '-profiles', JSON.stringify(p));
  renderProfileSelect();
}

function renderProfileSelect() {
  const sel = $('presetSelect'), p = profiles();
  if (!sel) return;
  sel.innerHTML = '<option value="">저장된 프리셋 없음</option>' + Object.keys(p).sort().map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
}

/* ==========================================================================
   Stat ID Aliases & Baseline Value Lookup
   ========================================================================== */

const STAT_ID_ALIAS = {
  contentAttack: 'attackFlat',
  contentAttackPct: 'attackPct',
  contentBossDamage: 'bossDamage',
  contentNormalDamage: 'normalDamage',
  contentAccuracy: 'accuracy',
  contentCritRate: 'critRate',
  contentCritDamage: 'critDamage',
  contentAttackSpeed: 'attackSpeed',
  contentDamage: 'damage',
  contentAmp: 'damageAmp',
  contentBasicDamage: 'basicDamage',
  contentSkillDamage: 'skillDamage',
  contentMinDamage: 'minDamage',
  contentMaxDamage: 'maxDamage',
  contentFinalDamage: 'finalDamage',
  contentMainPct: 'mainStatPct',
  contentMainFlat: 'mainStat',
  contentSubFlat: 'subStat',
  contentHp: 'maxHp',
  contentDefense: 'playerDefense',
  contentDefensePen: 'defPen',
  contentEvasion: 'evasion',
  contentLevel: 'level',
  contentJob: 'job',
  contentMaxMp: 'maxMp',
  contentDamageReduction: 'dmgReduction',
  contentCompanionDuration: 'companionDuration',
  contentBuffDuration: 'buffDuration',
  contentDebuffResist: 'debuffResist',
  contentBasicTargetCount: 'extraTargets',
  contentSkillCdrPct: 'cooldownReductionPct',
  contentSkillCdrSec: 'cooldownReductionSec',
  contentSkillCoefficient: 'skillCoefficient',
  contentBasicInterval: 'attackInterval'
};

function contentBaseline(id) {
  const actualId = STAT_ID_ALIAS[id] || id;
  const el = $(actualId) || $(id);
  if (!el || el.value === '') return null;
  const value = Number(el.value);
  return Number.isFinite(value) ? value : null;
}

const MEKICALC_STAT_MAP = {
  POWER: 'combatPower',
  LEVEL: 'level',
  ATK_FLAT: 'attackFlat',
  ATK_PCT: 'attackPct',
  MAX_HP: 'maxHp',
  MAX_MP: 'maxMp',
  DEFENSE: 'playerDefense',
  ACCURACY: 'accuracy',
  EVASION: 'evasion',
  BOSS_DMG: 'bossDamage',
  NORMAL_DMG: 'normalDamage',
  DMG: 'damage',
  DMG_AMP: 'damageAmp',
  BASIC_ATK_DMG: 'basicDamage',
  SKILL_DMG: 'skillDamage',
  CRIT_RATE: 'critRate',
  CRIT_DMG: 'critDamage',
  ATK_SPEED: 'attackSpeed',
  MAIN_STAT_FLAT: 'mainStat',
  MAIN_STAT_PCT: 'mainStatPct',
  SUB_STAT_FLAT: 'subStat',
  STAT_SCALING_DMG: 'damage',
  MP_REGEN: 'mpRegen',
  DMG_REDUCTION: 'dmgReduction',
  DEF_PEN: 'defPen',
  ABNORMAL_DMG: 'statusDamage',
  CRIT_RESIST: 'targetCritResist',
  MIN_DMG_MULT: 'minDamage',
  MAX_DMG_MULT: 'maxDamage',
  FINAL_DMG: 'finalDamage',
  COMPANION_DURATION: 'companionDuration',
  BUFF_DURATION: 'buffDuration',
  DEBUFF_RESIST: 'debuffResist',
  BASIC_TARGET_COUNT: 'extraTargets',
  SKILL_CDR_PCT: 'cooldownReductionPct',
  SKILL_CDR_SEC: 'cooldownReductionSec'
};

/* ==========================================================================
   Build Presets Management
   ========================================================================== */

function readBuildPresets() {
  try { return JSON.parse(localStorage.getItem(BUILD_PRESET_KEY) || '{}'); }
  catch { return {}; }
}

function currentBuildSnapshot() {
  return {
    state: snapshot(),
    inventory: localStorage.getItem('maple-growth-lab-companion-inventory') || '{}',
    presetOcr: localStorage.getItem('maple-growth-lab-preset-ocr-v01') || '{}',
    savedAt: new Date().toISOString()
  };
}

function renderBuildPresets() {
  const select = $('buildPresetSelect');
  if (!select) return;
  const presets = readBuildPresets(), current = select.value;
  select.innerHTML = '<option value="">현재 입력 (저장 안 됨)</option>' +
    Object.keys(presets).sort().map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  if (presets[current]) select.value = current;
  if ($('buildPresetStatus')) {
    $('buildPresetStatus').textContent = Object.keys(presets).length
      ? `${Object.keys(presets).length}개 프리셋 저장됨 · 현재 입력은 자동 저장`
      : '저장된 프리셋이 없습니다.';
  }
}

function saveBuildPreset() {
  const name = $('buildPresetName')?.value.trim();
  if (!name) {
    if ($('buildPresetStatus')) $('buildPresetStatus').textContent = '새 프리셋 이름을 먼저 입력하세요.';
    return;
  }
  const presets = readBuildPresets();
  presets[name] = currentBuildSnapshot();
  localStorage.setItem(BUILD_PRESET_KEY, JSON.stringify(presets));
  queueCloudSave();
  renderBuildPresets();
  if ($('buildPresetSelect')) $('buildPresetSelect').value = name;
  if ($('buildPresetName')) $('buildPresetName').value = '';
  if ($('buildPresetStatus')) $('buildPresetStatus').textContent = `${name} 프리셋을 저장했습니다.`;
}

function loadBuildPreset() {
  const name = $('buildPresetSelect')?.value;
  const preset = readBuildPresets()[name];
  if (!name || !preset) {
    if ($('buildPresetStatus')) $('buildPresetStatus').textContent = '불러올 프리셋을 선택하세요.';
    return;
  }
  if (preset.state) applySnapshot(preset.state);
  if (preset.inventory) {
    localStorage.setItem('maple-growth-lab-companion-inventory', typeof preset.inventory === 'string' ? preset.inventory : JSON.stringify(preset.inventory));
    loadOcrCompanions();
  }
  if (preset.presetOcr) {
    localStorage.setItem('maple-growth-lab-preset-ocr-v01', typeof preset.presetOcr === 'string' ? preset.presetOcr : JSON.stringify(preset.presetOcr));
  }
  queueCloudSave();
  if ($('buildPresetStatus')) $('buildPresetStatus').textContent = `${name} 프리셋을 불러왔습니다.`;
}

function updateBuildPreset() {
  const name = $('buildPresetSelect')?.value;
  if (!name) {
    if ($('buildPresetStatus')) $('buildPresetStatus').textContent = '업데이트할 프리셋을 먼저 선택하세요.';
    return;
  }
  const presets = readBuildPresets();
  if (!presets[name]) {
    if ($('buildPresetStatus')) $('buildPresetStatus').textContent = '선택한 프리셋을 찾지 못했습니다.';
    return;
  }
  presets[name] = currentBuildSnapshot();
  localStorage.setItem(BUILD_PRESET_KEY, JSON.stringify(presets));
  queueCloudSave();
  if ($('buildPresetStatus')) $('buildPresetStatus').textContent = `${name} 프리셋을 현재 입력값으로 업데이트했습니다.`;
}

function deleteBuildPreset() {
  const name = $('buildPresetSelect')?.value;
  if (!name) {
    if ($('buildPresetStatus')) $('buildPresetStatus').textContent = '삭제할 프리셋을 선택하세요.';
    return;
  }
  const presets = readBuildPresets();
  delete presets[name];
  localStorage.setItem(BUILD_PRESET_KEY, JSON.stringify(presets));
  renderBuildPresets();
  if ($('buildPresetStatus')) $('buildPresetStatus').textContent = `${name} 프리셋을 삭제했습니다.`;
}

/* ==========================================================================
   JSON Presets Export / Import
   ========================================================================== */

function currentMekiPresetDocument() {
  const selected = selectedCompanionScenario();
  const name = $('buildPresetSelect')?.value || selected?.label || '기본 세팅';
  const statName = `${name} · 스탯`;
  const allyName = `${name} · 동료`;
  const inventory = JSON.parse(localStorage.getItem('maple-growth-lab-companion-inventory') || '{}');
  const currentStats = {};
  for (const [key, id] of Object.entries(MEKICALC_STAT_MAP)) {
    const val = contentBaseline(id);
    if (val !== null) currentStats[key] = val;
  }
  return {
    format: 'maple-growth-presets',
    version: 1,
    statPresets: {
      active: statName,
      presets: {
        [statName]: {
          stats: currentStats,
          target: {
            ch: $('stageChapter')?.value || '',
            stage: $('stageSelect')?.value || $('contentTarget')?.value || ''
          }
        }
      }
    },
    allyPresets: {
      active: allyName,
      presets: {
        [allyName]: {
          inventory,
          lineup: readCompanionSlots()
        }
      }
    },
    buildPresets: {
      active: name,
      presets: {
        [name]: {
          statPreset: statName,
          allyPreset: allyName,
          target: $('contentTarget')?.value || ''
        }
      }
    }
  };
}

function downloadPresetDocument() {
  const blob = new Blob([JSON.stringify(currentMekiPresetDocument(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'maple-growth-lab-presets.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function applyImportedMekiStats(doc) {
  const active = doc?.statPresets?.active;
  const preset = (active && doc.statPresets.presets?.[active]) || Object.values(doc?.statPresets?.presets || {})[0];
  if (!preset?.stats) return false;
  const stats = preset.stats;
  for (const [key, id] of Object.entries(MEKICALC_STAT_MAP)) {
    if (stats[key] !== undefined && $(id)) {
      $(id).value = stats[key];
    }
  }
  const allyName = doc?.allyPresets?.active;
  const ally = (allyName && doc.allyPresets.presets?.[allyName]) || Object.values(doc?.allyPresets?.presets || {})[0];
  if (ally?.inventory) {
    localStorage.setItem('maple-growth-lab-companion-inventory', JSON.stringify(ally.inventory));
    loadOcrCompanions();
  }
  saveLocal();
  renderAll();
  return true;
}

function importPresetFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const doc = JSON.parse(reader.result);
      if (!applyImportedMekiStats(doc)) throw new Error('스탯 프리셋을 찾지 못했습니다.');
      alert('프리셋을 성공적으로 불러왔습니다.');
    } catch (e) {
      alert(`프리셋 불러오기 실패: ${e.message}`);
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   7-Slot Companion System, Inventory & Optimizer
   ========================================================================== */

const companionScenarios = {
  chapterBoss: { label: '챕터 보스', core: 'boss', focus: 'boss', note: '단일 보스 타임오버를 줄이는 조합을 비교합니다.' },
  chapterHunt: { label: '챕터 사냥', core: 'farm', focus: 'farm', note: '일반 웨이브 처리와 공격 속도를 우선합니다.' },
  worldBoss: { label: '월드 보스', core: 'boss', focus: 'boss', note: '보스 데미지·크리티컬·최대/최소 데미지의 상대 효율을 비교합니다.' },
  guildRaid: { label: '길드 토벌전', core: 'boss', focus: 'boss', note: '보스 대상 정적 DPS를 기준으로 비교합니다.' },
  weaponDungeon: { label: '무기·강화 던전', core: 'farm', focus: 'farm', note: '일반 몬스터 처리 속도와 기본/스킬 공격 비중을 봅니다.' },
  growthDungeon: { label: '경험치·장비 던전', core: 'farm', focus: 'farm', note: '웨이브 처리용 일반 데미지·공격 속도를 비교합니다.' },
  chapterChallenge: { label: '챕터 도전', core: 'chapter', focus: 'balanced', note: '보스와 일반 웨이브 중 약한 쪽을 기준으로 안전하게 비교합니다.' },
  arena: { label: '아레나', core: 'pvp', focus: 'pvp', note: 'PvP에서는 보스/일반 몬스터 데미지가 적용되지 않으며, 공격력·공속·크리티컬·최대/최소 데미지 위주로 반영됩니다.' },
  survival: { label: '생존·해금', core: 'survival', focus: 'boss', note: '생존 성공 확률 모델이 없어 DPS보다 통과 조건을 먼저 봅니다.' }
};

function selectedCompanionScenario() {
  return companionScenarios[$('compScenario')?.value] || companionScenarios.chapterBoss;
}

function applyCompanionScenario() {
  const scenario = selectedCompanionScenario();
  if ($('compGoal')) $('compGoal').value = scenario.core;
  if ($('compChapterFocus') && scenario.core === 'chapter') $('compChapterFocus').value = scenario.focus;
  renderCompanionGuide();
  updateCompanionResult();
}

const companionGuides = {
  boss: {
    title: '보스·길드 레이드',
    tag: '보스 대상 효과 우선',
    items: [
      ['보스 데미지', '나이트로드·윈드브레이커 등 등급별 장착 효과로 보스 데미지가 붙는 동료를 우선 확인합니다.'],
      ['명중', '다크나이트·나이트워커는 명중을 제공합니다. 목표 회피를 넘기지 못하면 1순위로 채택합니다.'],
      ['크리티컬·최종 효과', '아크메이지(불·독)의 크리티컬 확률, 캡틴의 크리티컬 데미지 등은 기준값에 맞춰 효율을 비교합니다.']
    ],
    note: '단일 보스 타임오버를 방지하기 위해 보스 데미지와 크리티컬 데미지를 집중 배치합니다.'
  },
  farm: {
    title: '일반 사냥',
    tag: '웨이브 처리',
    items: [
      ['일반 몬스터 데미지', '아크메이지(썬·콜)의 일반 몬스터 데미지처럼 웨이브 처리에 직접 기여하는 효과를 적용합니다.'],
      ['공격 속도', '보우마스터의 공격 속도로 타격 주기를 단축합니다.'],
      ['기본·스킬 데미지', '팔라딘의 기본 공격 데미지, 비숍의 스킬 데미지를 주력 사냥 패턴에 맞춥니다.']
    ],
    note: '웨이브 정리에 필요한 일반 데미지와 공격 속도, 스킬 데미지를 우선합니다.'
  },
  chapter: {
    title: '챕터 돌파',
    tag: '병목 구간 분리',
    items: [
      ['보스에서 막힘', '보스 데미지·명중·단일 대상 공격 성능을 우선합니다.'],
      ['웨이브에서 막힘', '일반 몬스터 데미지·공격 속도·기본/스킬 공격 유형을 우선합니다.'],
      ['스테이지 데이터', '콘텐츠 탭에서 챕터 몬스터의 HP·방어력·회피를 확인하여 병목을 진단합니다.']
    ],
    note: '보스와 일반 몬스터 양쪽 모두 통과할 수 있는 균형 잡힌 조합을 권장합니다.'
  },
  pvp: {
    title: 'PvP',
    tag: 'PvP 적용 범위 분리',
    items: [
      ['제외되는 효과', '보스 및 일반 몬스터 데미지는 PvP 계산에 미반영됩니다.'],
      ['공격·명중', '공격력·명중·크리티컬 계열을 상대 방어·회피와 함께 고려합니다.'],
      ['생존', 'HP·방어력·받는 피해 감소를 고르게 갖춥니다.']
    ],
    note: 'PvE 몬스터 전용 데미지 증폭 옵션은 제외하고 기본 공격력과 관통, 생존 위주로 구성합니다.'
  },
  survival: {
    title: '생존·해금',
    tag: '통과 조건 우선',
    items: [
      ['방어·보호막', '진입 스킬과 보호 효과를 먼저 확인합니다.'],
      ['명중 조건', '명중 부족은 공격력 증가로 대체되지 않으므로 필수 확보합니다.']
    ],
    note: '전투 완주를 위해 공격력보다 생존 및 명중 통과 조건을 먼저 확보합니다.'
  }
};

const ocrJobMap = {
  '히어로': 'hero', '팔라딘': 'paladin', '다크나이트': 'dark-knight',
  '보우마스터': 'bowmaster', '비숍': 'bishop',
  '아크메이지(불, 독)': 'archmage-fp', '아크메이지(불·독)': 'archmage-fp',
  '아크메이지(썬, 콜)': 'archmage-il', '아크메이지(썬·콜)': 'archmage-il',
  '윈드브레이커': 'wind-breaker', '나이트워커': 'night-walker',
  '캡틴': 'captain', '바이퍼': 'viper', '신궁': 'marksman',
  '셰도어': 'shadower', '섀도어': 'shadower', '나이트로드': 'night-lord'
};
const ocrGradeMap = { '에픽': 'epic', '유니크': 'unique', '레전더리': 'legendary' };

function parseOcrCompanionName(name) {
  const text = String(name || '').trim();
  const match = text.match(/^(에픽|유니크|레전더리)\s+(.+?)(?:\((?:2차|3차|4차)\))?$/);
  if (!match) return null;
  const job = ocrJobMap[match[2].trim()];
  const grade = ocrGradeMap[match[1]];
  return job && grade ? { job, grade } : null;
}

const companionInventoryJobNames = {
  'hero': '히어로', 'paladin': '팔라딘', 'dark-knight': '다크나이트',
  'bowmaster': '보우마스터', 'bishop': '비숍',
  'archmage-fp': '아크메이지(불, 독)', 'archmage-il': '아크메이지(썬, 콜)',
  'wind-breaker': '윈드브레이커', 'night-walker': '나이트워커',
  'captain': '캡틴', 'viper': '바이퍼', 'marksman': '신궁',
  'shadower': '셰도어', 'night-lord': '나이트로드'
};

function companionInventoryName(c) {
  return `${companionGradeLabel(c.grade)} ${companionInventoryJobNames[c.job] || companionLabel(c.job)}(2차)`;
}

const companionJobOrder = ['hero', 'paladin', 'dark-knight', 'archmage-il', 'archmage-fp', 'bishop', 'bowmaster', 'marksman', 'night-lord', 'shadower', 'viper', 'captain', 'night-walker', 'wind-breaker'];
const companionPortraitFiles = {
  'hero': 'hero', 'paladin': 'paladin', 'dark-knight': 'dark-knight',
  'archmage-il': 'archmage-ice-lightning', 'archmage-fp': 'archmage-fire-poison',
  'bishop': 'bishop', 'bowmaster': 'bowmaster', 'marksman': 'marksman',
  'night-lord': 'night-lord', 'shadower': 'shadower', 'viper': 'viper',
  'captain': 'captain', 'night-walker': 'night-walker', 'wind-breaker': 'wind-breaker'
};

function companionPortraitUrl(job) {
  return `https://mapleidleindex.com/assets/jobs/${companionPortraitFiles[job] || job}.webp`;
}

function companionLabel(job) {
  return companionDatabase.jobLabels?.[job] || companionInventoryJobNames[job] || job;
}

function companionGradeLabel(grade) {
  return companionDatabase.gradeLabels?.[grade] || ({ epic: '에픽', unique: '유니크', legendary: '레전더리' }[grade] || grade);
}

function companionEntry(job, grade, level) {
  const entry = companionDatabase.equippedStats?.[`${job}:${grade}`];
  return entry && entry.levels?.[Number(level) - 1] ? entry : null;
}

function companionSupporter(job, grade) {
  return companionDatabase.supporters?.find(x => x.typeId === job && x.grade === grade) || null;
}

function companionOptions(selectedJob = '') {
  const all = Object.keys(companionDatabase.jobLabels || {});
  const jobs = [...companionJobOrder.filter(j => all.includes(j)), ...all.filter(j => !companionJobOrder.includes(j))];
  return `<option value="">직업 선택</option>${jobs.map(j => `<option value="${j}" ${j === selectedJob ? 'selected' : ''}>${companionLabel(j)}</option>`).join('')}`;
}

function gradeOptions(selected = '') {
  return `<option value="">등급 선택</option>${['epic', 'unique', 'legendary'].map(g => `<option value="${g}" ${g === selected ? 'selected' : ''}>${companionGradeLabel(g)}</option>`).join('')}`;
}

function slotState(i) {
  const root = $(`companionSlot${i}`);
  return {
    job: root?.querySelector('.comp-job')?.value || '',
    grade: root?.querySelector('.comp-grade')?.value || '',
    level: Number(root?.querySelector('.comp-level')?.value) || 0
  };
}

function readCompanionSlots() {
  return Array.from({ length: COMPANION_SLOT_COUNT }, (_, i) => slotState(i));
}

function companionStateLabel(i) {
  return i === 0 ? '👑 메인 동료' : `서브 ${i}`;
}

function refreshLevelControl(i) {
  const root = $(`companionSlot${i}`);
  if (!root) return;
  const job = root.querySelector('.comp-job')?.value || '';
  const grade = root.querySelector('.comp-grade')?.value || '';
  const level = root.querySelector('.comp-level');
  const entry = companionDatabase.equippedStats?.[`${job}:${grade}`];
  const max = entry?.levels?.length || 0;
  if (level) {
    level.max = max || 999;
    level.placeholder = max ? `1~${max}` : '등급 선택';
    if (max && Number(level.value) > max) level.value = max;
  }
  const supporter = companionSupporter(job, grade);
  const meta = root.querySelector('.comp-meta');
  if (meta) {
    meta.textContent = entry
      ? `최대 Lv.${max} · 연동 공격 ${supporter?.linkedAttackStatBaseRatio ?? '—'}‰ · 스킬 ${supporter ? ((supporter.activeSkills?.length || 0) + (supporter.passiveSkills?.length || 0)) : '—'}개`
      : '직업·등급을 선택하세요';
  }
}

function renderCompanionSlots() {
  const wrap = $('companionSlots');
  if (!wrap) return;
  if (!Object.keys(companionDatabase.jobLabels || {}).length) {
    wrap.textContent = '동료 데이터를 불러오는 중입니다…';
    return;
  }
  wrap.innerHTML = Array.from({ length: COMPANION_SLOT_COUNT }, (_, i) => {
    const saved = savedCompanionSlots[i] || {};
    return `<div class="candidate" id="companionSlot${i}" style="border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:#fff;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong style="font-size:13px;color:var(--ink);">${companionStateLabel(i)}</strong>
        <span class="small comp-meta" style="color:var(--muted);font-size:11px;">직업·등급을 선택하세요</span>
      </div>
      <div class="fields" style="display:grid;grid-template-columns:1fr 1fr 80px;gap:6px;">
        <select class="comp-job" data-slot="${i}">${companionOptions(saved.job)}</select>
        <select class="comp-grade" data-slot="${i}">${gradeOptions(saved.grade)}</select>
        <input class="comp-level" data-slot="${i}" type="number" min="1" placeholder="레벨" value="${saved.level || ''}">
      </div>
    </div>`;
  }).join('');

  for (let i = 0; i < COMPANION_SLOT_COUNT; i++) {
    const root = $(`companionSlot${i}`);
    if (!root) continue;
    const job = root.querySelector('.comp-job');
    const grade = root.querySelector('.comp-grade');
    const level = root.querySelector('.comp-level');
    job?.addEventListener('change', () => { refreshLevelControl(i); saveLocal(); renderCombat(); updateCompanionResult(); });
    grade?.addEventListener('change', () => { refreshLevelControl(i); saveLocal(); renderCombat(); updateCompanionResult(); });
    level?.addEventListener('input', () => { saveLocal(); renderCombat(); updateCompanionResult(); });
    refreshLevelControl(i);
  }
}

function updateInventoryActions() {
  const count = ownedCompanions.length;
  const ready = count >= COMPANION_SLOT_COUNT;
  const opt = $('recommendFromInventoryBtn');
  if (opt) {
    opt.disabled = !ready;
    opt.textContent = ready ? '🚀 보유 목록으로 7인 라인업 최적화' : `보유 목록 ${count}/7명 · 먼저 입력하세요`;
  }
  if (!ready && $('companionInventoryStatus')) {
    $('companionInventoryStatus').textContent = count
      ? `현재 보유 후보 ${count}명입니다. 7인 라인업 최적화에는 직업·등급이 겹치지 않는 에픽 이상 동료 ${COMPANION_SLOT_COUNT}명이 필요합니다.`
      : '먼저 보유 동료를 입력하거나 OCR 화면에서 보유 현황을 저장하세요.';
  }
}

function renderInventoryRoster() {
  const wrap = $('ownedCompanionList');
  if (!wrap || !Object.keys(companionDatabase.jobLabels || {}).length) return;
  const groups = ['epic', 'unique', 'legendary'];
  wrap.innerHTML = groups.map(grade => {
    const rows = Object.keys(companionDatabase.jobLabels || {})
      .filter(job => companionDatabase.equippedStats?.[`${job}:${grade}`])
      .sort((a, b) => companionJobOrder.indexOf(a) - companionJobOrder.indexOf(b))
      .map(job => {
        const entry = companionDatabase.equippedStats[`${job}:${grade}`];
        const max = entry?.levels?.length || 999;
        const current = ownedCompanions.find(c => c.job === job && c.grade === grade);
        const level = current?.level || '';
        return `<div class="inventory-row ${current ? 'owned' : ''}" data-inventory-key="${job}:${grade}">
          <img class="companion-logo" src="${companionPortraitUrl(job)}" alt="${escapeHtml(companionLabel(job))}" loading="lazy">
          <div>
            <span class="inventory-name">${escapeHtml(companionLabel(job))}</span>
            <span class="inventory-meta">${escapeHtml(companionGradeLabel(grade))} · 최대 Lv.${max}</span>
          </div>
          <input class="inventory-level-input" data-job="${job}" data-grade="${grade}" type="number" min="1" max="${max}" value="${level}" placeholder="레벨">
          <span class="inventory-owned-label">${current ? '보유' : '미보유'}</span>
        </div>`;
      }).join('');
    const ownedCount = ownedCompanions.filter(c => c.grade === grade).length;
    const totalCount = Object.keys(companionDatabase.jobLabels || {}).filter(job => companionDatabase.equippedStats?.[`${job}:${grade}`]).length;
    return `<div class="inventory-grade-block">
      <div class="inventory-grade-head">
        <strong>${escapeHtml(companionGradeLabel(grade))}</strong>
        <span class="count">${ownedCount}명 입력 / ${totalCount}명</span>
      </div>
      <div class="inventory-grade-rows">${rows || '<div class="small">이 등급의 실제 데이터가 없습니다.</div>'}</div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.inventory-level-input').forEach(input => {
    input.addEventListener('change', () => {
      const job = input.dataset.job, grade = input.dataset.grade, value = Number(input.value);
      const entry = companionDatabase.equippedStats?.[`${job}:${grade}`];
      ownedCompanions = ownedCompanions.filter(c => !(c.job === job && c.grade === grade));
      if (value > 0 && entry && value <= entry.levels.length) {
        ownedCompanions.push({ job, grade, level: value, owned: true, source: 'manual' });
      }
      saveOwnedCompanions();
    });
  });
}

function renderOwnedCompanions() {
  renderInventoryRoster();
  updateInventoryActions();
}

function saveOwnedCompanions() {
  const source = {};
  ownedCompanions.forEach(c => {
    source[companionInventoryName(c)] = { owned: true, level: Number(c.level), source: 'manual' };
  });
  localStorage.setItem('maple-growth-lab-companion-inventory', JSON.stringify(source));
  queueCloudSave();
  renderOwnedCompanions();
}

function loadOcrCompanions() {
  try {
    const raw = localStorage.getItem('maple-growth-lab-companion-inventory') || '{}';
    const source = JSON.parse(raw);
    const byKey = new Map();
    Object.entries(source).forEach(([name, row]) => {
      const parsed = parseOcrCompanionName(name);
      if (parsed && row?.owned === true && Number(row?.level) > 0 && ['epic', 'unique', 'legendary'].includes(parsed.grade)) {
        byKey.set(`${parsed.job}:${parsed.grade}`, { ...parsed, name, level: Number(row.level), owned: true, confidence: row?.confidence ?? null, source: row?.source || 'ocr' });
      }
    });
    ownedCompanions = [...byKey.values()];
    if ($('companionInventoryStatus')) {
      $('companionInventoryStatus').textContent = ownedCompanions.length
        ? `보유 목록 연결 완료 · 에픽 이상 ${ownedCompanions.length}명`
        : '저장된 OCR 보유 목록이 없습니다. 목록에서 레벨을 직접 입력하세요.';
    }
    renderOwnedCompanions();
  } catch {
    ownedCompanions = [];
    if ($('companionInventoryStatus')) $('companionInventoryStatus').textContent = '보유 목록을 읽지 못했습니다. 목록에서 레벨을 직접 입력하세요.';
    renderOwnedCompanions();
  }
}

function companionSelections() {
  const selections = readCompanionSlots();
  return selections.map((s, i) => ({
    ...s,
    slot: i,
    label: companionStateLabel(i),
    entry: companionEntry(s.job, s.grade, s.level),
    supporter: companionSupporter(s.job, s.grade)
  })).filter(s => s.job && s.grade && s.level && s.entry);
}

function companionStatTotals(selected) {
  const totals = {};
  for (const s of selected) {
    for (const [key, value] of Object.entries(s.entry?.levels?.[s.level - 1] || {})) {
      totals[key] = (totals[key] || 0) + Number(value || 0);
    }
  }
  return totals;
}

function companionSkillSummary(selection) {
  const unlocked = [];
  if (selection.supporter?.enterSkillIndex) unlocked.push(selection.supporter.enterSkillIndex);
  for (const group of ['activeSkills', 'passiveSkills']) {
    for (const skill of selection.supporter?.[group] || []) {
      if (selection.level >= skill.unlockLevel) unlocked.push(skill.skillId);
    }
  }
  return unlocked.map(id => companionDatabase.skillsById?.[String(id)]).filter(Boolean);
}

function dpsPercentFactor(base, delta) {
  return base === null ? null : (100 + base + delta) / (100 + base);
}

function companionDpsImpact(stats, type) {
  const details = [], unknown = [];
  let factor = 1;
  const addFactor = (label, base, delta, formatter = dpsPercentFactor) => {
    if (!delta) return;
    if (base === null) { unknown.push(label + ' 기준값'); return; }
    const ratio = formatter(base, delta);
    if (ratio === null || !Number.isFinite(ratio)) { unknown.push(label + ' 기준값'); return; }
    factor *= ratio;
    details.push(`${label} +${Number(delta).toFixed(1)}%p · ×${ratio.toFixed(4)}`);
  };

  addFactor('공격력', contentBaseline('contentAttack'), stats.attackPlus, (base, delta) => base > 0 ? (base + delta) / base : null);
  addFactor('주 스탯', contentBaseline('contentMainPct'), stats.mainPct);
  addFactor('데미지', contentBaseline('contentDamage'), stats.damage);
  addFactor('데미지 증폭', contentBaseline('contentAmp'), stats.amp);

  const targetStat = type === 'boss' ? 'contentBossDamage' : (type === 'farm' ? 'contentNormalDamage' : null);
  if (type === 'boss' || type === 'farm') {
    addFactor(type === 'boss' ? '보스 데미지' : '일반 몬스터 데미지', contentBaseline(targetStat), stats[type === 'boss' ? 'bossDamage' : 'normalDamage']);
  }

  const basic = stats.basicDamage || 0, skill = stats.skillDamage || 0;
  if (basic || skill) {
    const baseBasic = contentBaseline('contentBasicDamage') ?? 0, baseSkill = contentBaseline('contentSkillDamage') ?? 0;
    const weighted = ((100 + baseBasic + basic) / (100 + baseBasic) + (100 + baseSkill + skill) / (100 + baseSkill)) / 2;
    factor *= weighted;
    details.push(`기본/스킬 데미지 ×${weighted.toFixed(4)}`);
  }

  if (stats.critRate || stats.critDamage) {
    const baseRate = contentBaseline('contentCritRate') ?? 0, baseCrit = contentBaseline('contentCritDamage') ?? 0;
    const before = 1 + Math.min(100, Math.max(0, baseRate)) / 100 * Math.max(0, baseCrit) / 100;
    const after = 1 + Math.min(100, Math.max(0, baseRate + Number(stats.critRate || 0))) / 100 * Math.max(0, baseCrit + Number(stats.critDamage || 0)) / 100;
    const ratio = after / before;
    if (Number.isFinite(ratio) && ratio > 0) {
      factor *= ratio;
      details.push(`크리티컬 기대값 ×${ratio.toFixed(4)}`);
    }
  }

  if (stats.attackSpeed) {
    const baseSpeed = contentBaseline('contentAttackSpeed') ?? 0;
    const cappedBase = Math.min(150, Math.max(0, baseSpeed));
    const after = cappedBase + (150 - cappedBase) * Math.min(150, Number(stats.attackSpeed)) / 150;
    const ratio = (1 + after / 100) / (1 + cappedBase / 100);
    if (Number.isFinite(ratio) && ratio > 0) {
      factor *= ratio;
      details.push(`공격 속도(상한 150%) 점감 배율 ×${ratio.toFixed(4)}`);
    }
  }

  if (stats.minDamage || stats.maxDamage) {
    const baseMin = contentBaseline('contentMinDamage') ?? 100;
    const baseMax = contentBaseline('contentMaxDamage') ?? 100;
    const before = Math.max(1, (baseMin + baseMax) / 2);
    const after = Math.max(1, (baseMin + Number(stats.minDamage || 0) + baseMax + Number(stats.maxDamage || 0)) / 2);
    const ratio = after / before;
    if (Number.isFinite(ratio) && ratio > 0) {
      factor *= ratio;
      const parts = [];
      if (stats.minDamage) parts.push(`최소 +${Number(stats.minDamage).toFixed(1)}%p`);
      if (stats.maxDamage) parts.push(`최대 +${Number(stats.maxDamage).toFixed(1)}%p`);
      details.push(`최소/최대 데미지(${parts.join(', ')}) ×${ratio.toFixed(4)}`);
    }
  }

  return { factor, details, unknown };
}

function companionContentScore(selected, type) {
  const stats = companionStatTotals(selected);
  if (type === 'survival') return { stats, impact: { factor: 1, details: [], unknown: ['생존 성공 확률'] }, score: 0, display: '정량 DPS 제외' };
  if (type === 'chapter') {
    const boss = companionDpsImpact(stats, 'boss'), farm = companionDpsImpact(stats, 'farm');
    const focus = $('compChapterFocus')?.value || 'balanced';
    const score = focus === 'boss' ? boss.factor : (focus === 'farm' ? farm.factor : Math.min(boss.factor, farm.factor));
    return {
      stats,
      impact: { factor: score, details: [`보스 ×${boss.factor.toFixed(4)}`, `일반 ×${farm.factor.toFixed(4)}`], unknown: [...new Set([...boss.unknown, ...farm.unknown])] },
      score,
      display: `보스 ×${boss.factor.toFixed(4)} · 일반 ×${farm.factor.toFixed(4)}`
    };
  }
  const impact = companionDpsImpact(stats, type);
  return { stats, impact, score: impact.factor, display: `상대 DPS 배율 ×${impact.factor.toFixed(4)}` };
}

function companionEffectText(stats) {
  const names = {
    attackPlus: '공격력', mainPct: '주 스탯%', attackSpeed: '공격 속도', basicDamage: '기본 공격 데미지',
    skillDamage: '스킬 데미지', bossDamage: '보스 몬스터 데미지', normalDamage: '일반 몬스터 데미지',
    critRate: '크리티컬 확률', critDamage: '크리티컬 데미지', minDamage: '최소 데미지 배율',
    maxDamage: '최대 데미지 배율', statusDamage: '상태이상 데미지', hit: '명중'
  };
  return Object.entries(stats).filter(([, v]) => v).map(([key, value]) => `${names[key] || key} +${Number(value).toFixed(1)}${['attackPlus', 'hit'].includes(key) ? '' : '%p'}`).join(' · ') || '장착 스탯 없음';
}

function updateCompanionResult() {
  if (!Object.keys(companionDatabase.equippedStats || {}).length) return;
  const selected = companionSelections();
  if (!selected.length) {
    if ($('companionVerdict')) {
      $('companionVerdict').className = 'verdict warn';
      $('companionVerdict').textContent = '메인·서브 동료의 직업, 등급, 레벨을 입력하세요.';
    }
    if ($('companionSummary')) $('companionSummary').textContent = '현재 선택된 동료가 없습니다.';
    return;
  }
  const duplicates = selected.map(s => `${s.job}:${s.grade}`);
  if (new Set(duplicates).size !== duplicates.length) {
    if ($('companionVerdict')) {
      $('companionVerdict').className = 'verdict warn';
      $('companionVerdict').textContent = '같은 종류·등급의 동료는 중복 장착할 수 없습니다.';
    }
    return;
  }
  const goal = $('compGoal')?.value || 'boss';
  const result = companionContentScore(selected, goal);
  if ($('companionVerdict')) {
    const pvpIgnored = goal === 'pvp' && (result.stats.bossDamage || result.stats.normalDamage) ? ' (보공/일공 0% 제외 반영)' : '';
    $('companionVerdict').className = 'verdict good';
    $('companionVerdict').textContent = `${selected.length < COMPANION_SLOT_COUNT ? `입력 ${selected.length}/${COMPANION_SLOT_COUNT}개 · ` : ''}${selectedCompanionScenario().label} · ${result.display}${pvpIgnored}`;
  }
  if ($('companionSummary')) {
    $('companionSummary').textContent = companionSummary(selected, result, goal);
  }
}

function companionSummary(selected, result, goal = $('compGoal')?.value || 'boss') {
  const statText = companionEffectText(result.stats);
  const ownText = selected.map(s => `${s.label}: ${companionLabel(s.job)} ${companionGradeLabel(s.grade)} Lv.${s.level} · 연동 공격 ${s.supporter?.linkedAttackStatBaseRatio ?? '—'}‰`).join('\n');

  let pvpNotice = '';
  if (goal === 'pvp' && (result.stats.bossDamage || result.stats.normalDamage)) {
    const invalidStats = [];
    if (result.stats.bossDamage) invalidStats.push(`보스 몬스터 데미지 +${Number(result.stats.bossDamage).toFixed(1)}%p`);
    if (result.stats.normalDamage) invalidStats.push(`일반 몬스터 데미지 +${Number(result.stats.normalDamage).toFixed(1)}%p`);
    pvpNotice = `\n\n⚠️ 아레나(PvP) 무효 스탯 안내:
- [${invalidStats.join(', ')}]은(는) 유저 간 대전인 아레나에서 적용되지 않아 실전 DPS 기여도가 0%입니다.
- 추천 유효 동료: 캡틴(크리티컬 데미지), 아크메이지 불·독(크리티컬 확률), 바이퍼(주 스탯%), 섀도어(최소 데미지), 팔라딘(기본 공격 데미지), 비숍(스킬 데미지), 다크나이트·나이트워커(명중)`;
  }

  return `[실제 동료 세팅 비교]
목표: ${selectedCompanionScenario().label}

입력 세팅 (총 ${selected.length}명)
${ownText}

장착 스탯 합계
${statText}

상대 DPS 배율
- ${result.display}
- ${result.impact.details.length ? result.impact.details.join(' · ') : '직접 계산 배율 없음'}${pvpNotice}
${result.impact.unknown.length ? '\n추가 기준값 필요: ' + [...new Set(result.impact.unknown)].join(', ') : ''}

※ 동료 장착 효과는 캐릭터 전투 계산 및 종합 전투력에 실시간 자동 반영됩니다.`;
}

/* --- Optimizer Search Algorithm --- */

function companionRarityScore(grade) {
  return ({ normal: 0, rare: 1, epic: 2, unique: 3, legendary: 4 }[grade] ?? 0);
}

function companionOptimizerStatScore(stats, type) {
  if (type === 'survival') return 0;
  if (type === 'chapter') {
    const boss = companionDpsImpact(stats, 'boss').factor;
    const farm = companionDpsImpact(stats, 'farm').factor;
    const focus = $('compChapterFocus')?.value || 'balanced';
    return focus === 'boss' ? boss : (focus === 'farm' ? farm : Math.min(boss, farm));
  }
  return companionDpsImpact(stats, type).factor;
}

function companionRawTieScore(stats, type, candidate) {
  const keys = type === 'boss'
    ? ['bossDamage', 'attackPlus', 'attackSpeed', 'critRate', 'critDamage', 'maxDamage', 'minDamage', 'mainPct']
    : (type === 'farm'
      ? ['normalDamage', 'attackPlus', 'attackSpeed', 'basicDamage', 'skillDamage', 'maxDamage', 'minDamage', 'mainPct']
      : (type === 'pvp'
        ? ['attackPlus', 'attackSpeed', 'critRate', 'critDamage', 'maxDamage', 'minDamage', 'basicDamage', 'skillDamage', 'mainPct', 'hit']
        : ['attackPlus', 'attackSpeed', 'critRate', 'critDamage', 'maxDamage', 'minDamage', 'mainPct']));
  const direct = keys.reduce((sum, key) => sum + (Number(stats[key]) || 0), 0);
  return direct + (candidate ? companionRarityScore(candidate.grade) * 1e-4 + (Number(candidate.level) || 0) * 1e-7 : 0);
}

function chooseCompanionMain(set) {
  return [...set].sort((a, b) => {
    return (Number(b.level) || 0) - (Number(a.level) || 0) || companionRarityScore(b.grade) - companionRarityScore(a.grade);
  })[0];
}

function companionStatsAdd(a, b) {
  const out = { ...a };
  for (const [key, value] of Object.entries(b || {})) out[key] = (out[key] || 0) + Number(value || 0);
  return out;
}

function companionStatsBound(partial, remaining, need) {
  const out = { ...partial };
  const keys = new Set(Object.keys(partial));
  remaining.forEach(c => Object.keys(c.entry?.levels?.[c.level - 1] || {}).forEach(k => keys.add(k)));
  for (const key of keys) {
    const values = remaining.map(c => Number(c.entry?.levels?.[c.level - 1]?.[key]) || 0).sort((a, b) => b - a).slice(0, need);
    out[key] = (out[key] || 0) + values.reduce((sum, v) => sum + v, 0);
  }
  return out;
}

function companionOwnedCandidates() {
  const seen = new Set();
  return ownedCompanions.map(c => {
    const entry = companionEntry(c.job, c.grade, c.level);
    return entry ? { ...c, entry, supporter: companionSupporter(c.job, c.grade) } : null;
  }).filter(c => {
    if (!c) return false;
    const key = `${c.job}:${c.grade}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function companionOptimizerExact(pool, type) {
  const target = Math.min(COMPANION_SLOT_COUNT, pool.length);
  if (target < 1) return { best: null, alternatives: [], nodes: 0, exact: false, reason: '보유 데이터 없음' };
  const searchPool = pool.slice().sort((a, b) => {
    const as = a.entry.levels[a.level - 1] || {}, bs = b.entry.levels[b.level - 1] || {};
    return companionOptimizerStatScore(bs, type) - companionOptimizerStatScore(as, type) || companionRawTieScore(bs, type, b) - companionRawTieScore(as, type, a);
  });
  const ranked = [];
  let nodes = 0, aborted = false, bestScore = -Infinity, bestTie = -Infinity;
  const limit = 200000;

  const visit = (start, picks, items, stats) => {
    if (++nodes > limit) { aborted = true; return; }
    const need = target - picks;
    if (!need) {
      const score = companionOptimizerStatScore(stats, type);
      const tie = companionRawTieScore(stats, type) + items.reduce((sum, item) => sum + companionRarityScore(item.grade) * 1e-4 + (Number(item.level) || 0) * 1e-7, 0);
      const result = { items: [...items], stats, score, tie, main: chooseCompanionMain(items) };
      ranked.push(result);
      if (score > bestScore + 1e-10 || (Math.abs(score - bestScore) <= 1e-10 && tie > bestTie)) {
        bestScore = score;
        bestTie = tie;
      }
      return;
    }
    if (searchPool.length - start < need) return;
    const remaining = searchPool.slice(start);
    const bound = companionOptimizerStatScore(companionStatsBound(stats, remaining, need), type);
    if (bound < bestScore - 1e-10) return;
    for (let i = start; i <= searchPool.length - need; i++) {
      const candidate = searchPool[i];
      const nextStats = companionStatsAdd(stats, candidate.entry?.levels?.[candidate.level - 1]);
      visit(i + 1, picks + 1, [...items, candidate], nextStats);
      if (aborted) return;
    }
  };

  visit(0, 0, [], {});
  ranked.sort((a, b) => b.score - a.score || b.tie - a.tie);
  return { best: ranked[0] || null, alternatives: ranked.slice(0, 3), nodes, exact: !aborted, reason: '보유 동료 전수 조합 탐색 완료' };
}

function companionOptimizerFallback(pool, type, reason) {
  const scored = pool.map(candidate => {
    const stats = candidate.entry.levels[candidate.level - 1] || {};
    return { candidate, stats, score: companionOptimizerStatScore(stats, type), tie: companionRawTieScore(stats, type, candidate) };
  }).sort((a, b) => b.score - a.score || b.tie - a.tie || b.candidate.level - a.candidate.level);
  const chosen = scored.slice(0, Math.min(COMPANION_SLOT_COUNT, scored.length)).map(x => x.candidate);
  return {
    best: chosen.length ? { items: chosen, stats: companionStatTotals(chosen), score: companionOptimizerStatScore(companionStatTotals(chosen), type), tie: 0, main: chooseCompanionMain(chosen) } : null,
    alternatives: [],
    nodes: 0,
    exact: false,
    reason: reason || '휴리스틱 단일 기여도 정렬'
  };
}

function applyCompanionLineup(result) {
  if (!result?.best) return;
  const chosen = [result.best.main, ...result.best.items.filter(c => c !== result.best.main)];
  chosen.forEach((c, i) => {
    const root = $(`companionSlot${i}`);
    if (!root) return;
    root.querySelector('.comp-job').value = c.job;
    root.querySelector('.comp-grade').value = c.grade;
    root.querySelector('.comp-level').value = c.level;
    refreshLevelControl(i);
  });
  saveLocal();
  renderCombat();
  updateCompanionResult();
}

function recommendFromInventory() {
  if (!ownedCompanions.length) {
    loadOcrCompanions();
    if (!ownedCompanions.length) return;
  }
  const type = $('compGoal')?.value || 'boss';
  const pool = companionOwnedCandidates();
  if (pool.length < COMPANION_SLOT_COUNT) {
    if ($('companionInventoryStatus')) {
      $('companionInventoryStatus').textContent = `최적화에는 직업·등급이 겹치지 않는 에픽 이상 동료 ${COMPANION_SLOT_COUNT}명이 필요합니다 · 현재 ${pool.length}명`;
    }
    return;
  }
  const result = companionOptimizerExact(pool, type) || companionOptimizerFallback(pool, type);
  applyCompanionLineup(result);
  if ($('companionInventoryStatus')) {
    $('companionInventoryStatus').textContent = `보유 ${pool.length}명에서 최적 7인 라인업을 장착했습니다! · 메인: ${result.best ? companionLabel(result.best.main.job) : '—'} · 상대 DPS 배율 ×${(result.best?.score || 1).toFixed(4)}`;
  }
}

function optimizeCompanions() {
  const all = companionSelections(), type = $('compGoal')?.value || 'boss';
  if (all.length < 1) { updateCompanionResult(); return; }
  const result = companionOptimizerExact(all, type) || companionOptimizerFallback(all, type);
  applyCompanionLineup(result);
}

function renderCommunityPreset() {
  if (!communityGuide?.presets) return;
  const select = $('compPreset');
  const keys = Object.keys(communityGuide.presets);
  if (select && (!select.options.length || select.options.length !== keys.length)) {
    select.innerHTML = keys.map(key => `<option value="${key}">${communityGuide.presets[key].label}</option>`).join('');
  }
  const preset = communityGuide.presets[select?.value || 'chapterBoss'] || communityGuide.presets.chapterBoss;
  const label = job => companionLabel(job);
  const subText = preset.subs.map((choices, i) => `${i + 1}. ${choices.map(label).join(' / ')}`).join(' · ');
  if ($('communityPreset')) {
    $('communityPreset').innerHTML = `<strong>${preset.label} · 커뮤니티 참고 프리셋</strong><br>` +
      `메인: ${preset.main.map(label).join(' / ')}<br>서브: ${subText}<br>` +
      `<span class="small" style="color:var(--muted);">직업 배치 참고값입니다. 등급과 레벨은 내 보유 상태에 맞춰 설정하세요.</span>`;
  }
}

function applyCommunityPreset() {
  if (!communityGuide?.presets || !Object.keys(companionDatabase.jobLabels || {}).length) return;
  const preset = communityGuide.presets[$('compPreset')?.value || 'chapterBoss'] || communityGuide.presets.chapterBoss;
  const jobs = [preset.main[0], ...preset.subs.map(c => c[0])];
  jobs.forEach((job, i) => {
    const root = $(`companionSlot${i}`);
    if (!root) return;
    const sel = root.querySelector('.comp-job');
    if (sel) sel.value = job;
    refreshLevelControl(i);
  });
  saveLocal();
  renderCombat();
  updateCompanionResult();
}

function loadCommunityGuide() {
  fetch('data/community-companion-guide.json')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      communityGuide = data;
      renderCommunityPreset();
    })
    .catch(() => {});
}

function renderCompanionGuide() {
  const scenario = selectedCompanionScenario();
  const g = companionGuides[scenario.core] || companionGuides.boss;
  const box = $('companionGuide');
  if (!box) return;
  box.innerHTML = `<div class="guide-item">
    <strong>${escapeHtml(scenario.label)} · ${escapeHtml(g.tag)}</strong>
    <div>${escapeHtml(scenario.note)}</div>
    ${g.items.map(x => `<div style="margin-top:6px;"><b>${escapeHtml(x[0])}</b>: ${escapeHtml(x[1])}</div>`).join('')}
    <div class="content-benchmark" style="margin-top:8px;"><b>핵심</b>: ${escapeHtml(g.note)}</div>
  </div>`;
}

function selectedCompanionEffect() {
  const rt = DATA.companionRuntime;
  if (!rt) return null;
  const job = RUNTIME_JOB[$('job')?.value];
  const grade = $('companionGrade')?.value;
  if (!job || !grade) return null;
  const rec = rt.equippedStats?.[job + ':' + grade];
  if (!rec || !rec.levels?.length) return null;
  const level = clamp(n('companionLevel') || 1, 1, rec.levels.length);
  return { level, grade, record: rec, values: rec.levels[level - 1] || {} };
}

function renderCompanionEffect() {
  const c = selectedCompanionEffect(), box = $('companionEffect');
  if (!box) return;
  if (!c) {
    box.textContent = '직업과 등급을 선택하면 장착 효과를 표시합니다.';
    return;
  }
  const rows = Object.entries(c.values).map(([key, val]) => `<span>${EFFECT_LABEL[key] || key} <b>${val}</b></span>`).join('');
  box.innerHTML = `<div class="effect-list">${rows || '<span>표시할 장착 효과 없음</span>'}</div>`;
}

/* ==========================================================================
   Stage Data, Monster HP & Diagnostic Advisor (Tab 3)
   ========================================================================== */

function stageRows() {
  const mode = $('stageMode')?.value || 'hunt';
  if (mode === 'hunt') return DATA.stageData?.hunt || [];
  if (mode === 'trial') return DATA.stageData?.trial || [];
  if (mode === 'boss_raid') {
    const pink = (DATA.bossData?.pinkbean_raid || []).map(x => ({
      chapter: '핑크빈',
      stage: `핑크빈 (${x.difficulty})`,
      category: '보스',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      BossHp_min: Number(x.visible_total || x.primary_hp || 0),
      BossHp_max: Number(x.visible_total || x.primary_hp || 0),
      avoid: x.avoid,
      time_sec: x.time_sec || 480
    }));
    const raid = (DATA.bossData?.boss_raid || []).map(x => ({
      chapter: x.boss,
      stage: `${x.boss} (${x.difficulty})`,
      category: '보스',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      BossHp_min: Number(x.visible_total || x.primary_hp || 0),
      BossHp_max: Number(x.visible_total || x.primary_hp || 0),
      avoid: x.avoid,
      time_sec: 180
    }));
    return [...pink, ...raid];
  }
  if (mode === 'world_boss') {
    return (DATA.bossData?.world_boss || []).map(x => ({
      chapter: '월드 보스',
      stage: `월드보스 ${x.level}단계`,
      category: '보스',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      BossHp_min: Number(x.hp || 0),
      BossHp_max: Number(x.hp || 0),
      avoid: x.avoid,
      time_sec: 180
    }));
  }
  if (mode === 'growth_dungeon') {
    const gd = DATA.growthDungeonData || {};
    const weapon = (gd.weapon_dungeon || []).map(x => ({
      chapter: '무기 던전',
      stage: `무기 던전 ${x.stage}단계`,
      category: '던전',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      NormalHp_min: Number(x.hp || 0),
      NormalHp_max: Number(x.hp || 0),
      avoid: x.avoid,
      time_sec: x.time_sec || 22
    }));
    const exp = (gd.exp_dungeon || []).map(x => ({
      chapter: '경험치 던전',
      stage: `경험치 던전 ${x.stage}단계`,
      category: '던전',
      Defence_min: Number(x.normal_defence || 0),
      Defence_max: Number(x.normal_defence || 0),
      NormalHp_min: Number(x.normal1_hp || 0),
      NormalHp_max: Number(x.normal1_hp || 0),
      avoid: x.normal_avoid,
      time_sec: x.base_time_sec || 22
    }));
    const gear = (gd.gear_dungeon || []).map(x => ({
      chapter: '장비 던전',
      stage: `장비 던전 ${x.stage}단계`,
      category: '던전',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      NormalHp_min: Number(x.normal_hp || 0),
      NormalHp_max: Number(x.normal_hp || 0),
      avoid: x.normal_avoid,
      time_sec: x.time_sec || 30
    }));
    const train = (gd.training_ground || []).map(x => ({
      chapter: '용사의 수련장',
      stage: `용사의 수련장 ${x.stage}단계`,
      category: '던전',
      Defence_min: Number(x.boss_defence || x.normal_defence || 0),
      Defence_max: Number(x.boss_defence || x.normal_defence || 0),
      BossHp_min: Number(x.boss_hp || x.normal_hp || 0),
      BossHp_max: Number(x.boss_hp || x.normal_hp || 0),
      avoid: x.boss_avoid,
      time_sec: x.total_time_sec || 50
    }));
    const enh = (gd.enhance_dungeon || []).map(x => ({
      chapter: '강화 던전',
      stage: `강화 던전 ${x.stage}단계`,
      category: '던전',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      NormalHp_min: Number(x.hp || 0),
      NormalHp_max: Number(x.hp || 0),
      avoid: x.avoid,
      time_sec: x.time_sec || 25
    }));
    return [...weapon, ...exp, ...gear, ...train, ...enh];
  }
  if (mode === 'guild_content') {
    const g = DATA.guildData || {};
    const gboss = (g.guild_boss || []).map(x => ({
      chapter: '길드 토벌전',
      stage: `길드 토벌전 ${x.stage}단계`,
      category: '길드',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      BossHp_min: Number(x.hp || 0),
      BossHp_max: Number(x.hp || 0),
      avoid: x.avoid,
      time_sec: x.available_time_sec || 50
    }));
    const gleague = (g.guild_league || []).map(x => ({
      chapter: '길드 대항전',
      stage: `길드 대항전 Wave ${x.wave}`,
      category: '길드',
      Defence_min: Number(x.boss_defence || 0),
      Defence_max: Number(x.boss_defence || 0),
      BossHp_min: Number(x.wave_effective || x.boss_hp || 0),
      BossHp_max: Number(x.wave_effective || x.boss_hp || 0),
      avoid: x.boss_avoid,
      time_sec: 60
    }));
    const gregular = (g.training_regular || []).map((x, i) => ({
      chapter: '길드 수련장 (일반)',
      stage: `길드 수련장 일반 ${i + 1}단계`,
      category: '길드',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      NormalHp_min: Number(x.hp || 0),
      NormalHp_max: Number(x.hp || 0),
      avoid: x.avoid,
      time_sec: 60
    }));
    const gspecial = (g.training_special || []).map((x, i) => ({
      chapter: '길드 수련장 (특수)',
      stage: `길드 수련장 특수 ${i + 1}단계`,
      category: '길드',
      Defence_min: Number(x.defence || 0),
      Defence_max: Number(x.defence || 0),
      NormalHp_min: Number(x.hp || 0),
      NormalHp_max: Number(x.hp || 0),
      avoid: x.avoid,
      time_sec: 60
    }));
    return [...gboss, ...gleague, ...gregular, ...gspecial];
  }
  return DATA.stageData?.[mode] || [];
}

function fillStageChapters() {
  const sel = $('stageChapter');
  if (!sel) return;
  const chapters = [...new Set(stageRows().map(x => x.chapter))];
  chapters.sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'ko');
  });
  const current = sel.value;
  const next = current || String(chapters[0] || '');
  sel.innerHTML = '<option value="">구분/챕터 선택</option>' + chapters.map(c => `<option value="${c}">${typeof c === 'number' ? c + '장' : c}</option>`).join('');
  if (chapters.map(String).includes(String(next))) sel.value = next;
  fillStages();
}

function fillStages() {
  const chapter = $('stageChapter')?.value || '';
  const sel = $('stageSelect');
  if (!sel) return;
  const rows = stageRows().filter(x => !chapter || String(x.chapter) === String(chapter));
  const current = sel.value;
  sel.innerHTML = '<option value="">단계/스테이지 선택</option>' + rows.map(x => `<option value="${x.stage}">${x.stage} · ${x.category || '일반'}</option>`).join('');
  if (rows.some(x => String(x.stage) === String(current))) sel.value = current;
  applyStageTarget();
  renderStageInfo();
}

function selectedStageRow() {
  const stage = $('stageSelect')?.value;
  return stage ? stageRows().find(x => String(x.stage) === String(stage)) || null : null;
}

function applyStageTarget() {
  const row = selectedStageRow();
  if (!row) return;
  const def = (Number(row.Defence_min || 0) + Number(row.Defence_max || row.Defence_min || 0)) / 2;
  const isBoss = row.category === '보스' || row.category === '파티보스' || row.category === '월드보스' || (Boolean(row.BossHp_min) && !row.NormalHp_min);
  const hpKey = $('stageMode')?.value === 'trial' ? (isBoss ? 'BossHp' : 'NormalHp') : 'MaxHp';
  const minVal = Number(row[hpKey + '_min']) || Number(row.MaxHp_min) || Number(row.BossHp_min) || Number(row.NormalHp_min) || 0;
  const maxVal = Number(row[hpKey + '_max']) || Number(row.MaxHp_max) || Number(row.BossHp_max) || Number(row.NormalHp_max) || minVal;
  const hp = (minVal + maxVal) / 2;
  if (def && $('targetDefense')) $('targetDefense').value = def;
  if (hp && $('targetMaxHp')) $('targetMaxHp').value = hp;
  if ($('targetType') && $('targetType').value !== 'pvp') $('targetType').value = isBoss ? 'boss' : 'normal';
  renderStageVerdict();
}

function stageAverage(row, minKey, maxKey) {
  if (!row) return null;
  const a = Number(row[minKey] ?? row[maxKey] ?? row[minKey.toLowerCase()]);
  const b = Number(row[maxKey] ?? row[minKey] ?? row[maxKey.toLowerCase()]);
  return Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : (Number.isFinite(a) ? a : (Number.isFinite(b) ? b : null));
}

function stageHpAverage(row, type) {
  if (!row) return null;
  if (type === 'farm') {
    return stageAverage(row, 'NormalHp_min', 'NormalHp_max') ?? stageAverage(row, 'MaxHp_min', 'MaxHp_max') ?? (row.hp ? Number(row.hp) : null);
  }
  return stageAverage(row, 'BossHp_min', 'BossHp_max') ?? stageAverage(row, 'MaxHp_min', 'MaxHp_max') ?? (row.hp ? Number(row.hp) : null);
}

function renderStageInfo() {
  const box = $('stageInfo'), row = selectedStageRow();
  if (!box) return;
  if (!row) {
    box.textContent = '스테이지를 선택하면 몬스터 HP·방어력·명중·회피를 표시합니다.';
    return;
  }
  const range = (a, b) => a === undefined || a === null ? '—' : a === b ? String(a) : `${a}~${b}`;
  const hp = (row.BossHp_min !== undefined && row.BossHp_min !== null)
    ? `보스 HP ${range(fmt(row.BossHp_min), fmt(row.BossHp_max))} · 일반 HP ${range(fmt(row.NormalHp_min), fmt(row.NormalHp_max))}`
    : (row.MaxHp_min !== undefined ? `HP ${range(fmt(row.MaxHp_min), fmt(row.MaxHp_max))}` : `HP ${fmt(row.hp || 0)}`);
  const def = range(row.Defence_min ?? row.defence, row.Defence_max ?? row.defence);
  const hit = range(row.HitChance_min ?? row.hit, row.HitChance_max ?? row.hit);
  const avoid = range(row.AvoidChance_min ?? row.avoid, row.AvoidChance_max ?? row.avoid);
  const timeLimit = row.time_sec ? ` · 제한시간 ${row.time_sec}초` : '';
  box.innerHTML = `<strong>${escapeHtml(row.stage || `${row.chapter}-${row.stage_no}`)}</strong> (${escapeHtml(row.category || '일반')})<br>` +
    `${hp} · 방어력 ${def} · 명중 ${hit} · 회피 ${avoid}${timeLimit}`;
}

const contentGuides = {
  boss: {
    title: '보스·레이드',
    items: [
      ['1순위', '명중과 보스 데미지로 실제 타격 손실·보스 배율을 먼저 안정화'],
      ['2순위', '크리티컬 확률이 낮다면 크리티컬 데미지보다 확률을 먼저 확보'],
      ['3순위', '방어 관통력과 최종 데미지로 보스 고방어력 감쇄를 극복']
    ],
    bench: '초기 기준: 명중 90% 이상 · 크리티컬 확률 70% · 보스 데미지 100%'
  },
  farm: {
    title: '일반 사냥',
    items: [
      ['1순위', '일반 몬스터 데미지와 공격 속도로 웨이브 처리 시간을 단축'],
      ['2순위', '광역 타격 수·이동 효율로 처치 회전율 극대화'],
      ['3순위', '명중 부족으로 MISS가 나면 공격력보다 명중을 먼저 보정']
    ],
    bench: '초기 기준: 명중 85% 이상 · 일반 몬스터 데미지 100% · 공격 속도 30%'
  },
  chapter: {
    title: '챕터 돌파',
    items: [
      ['1순위', '보스와 일반 웨이브를 모두 통과할 수 있는 균형형 세팅'],
      ['2순위', '막히는 구간이 보스면 보스 데미지, 웨이브면 일반 데미지로 분기'],
      ['3순위', '생존이 부족하면 공격력보다 HP·방어·피해 감소를 먼저 보정']
    ],
    bench: '초기 기준: 명중 90% 이상 · 공격력/피해 100% · HP·방어 생존 여부 확인'
  },
  pvp: {
    title: 'PvP 대항전',
    items: [
      ['1순위', '상대 회피와 크저를 넘어서는 명중 및 크리티컬 확률 확보'],
      ['2순위', '받는 피해 감소와 방어력으로 교전 생존 시간 확보'],
      ['3순위', '방어 관통력으로 상대 고방어력 무력화']
    ],
    bench: '초기 기준: 명중 90% 이상 · 방어 관통력 20% · 받는 피해 감소'
  }
};

function renderContentGuide() {
  const type = $('contentType')?.value || 'boss';
  const g = contentGuides[type] || contentGuides.boss;
  const box = $('contentGuide');
  if (!box) return;
  box.innerHTML = g.items.map(x => `<div class="guide-item"><strong>${escapeHtml(x[0])}</strong>: ${escapeHtml(x[1])}</div>`).join('') +
    `<div class="content-benchmark">${escapeHtml(g.bench)}</div>`;
}

const contentRules = {
  boss: [
    ['보스 데미지', 'bossDamage', 100, .32],
    ['명중', 'accuracy', 90, .22],
    ['크리티컬 확률', 'critRate', 70, .14],
    ['크리티컬 데미지', 'critDamage', 50, .12],
    ['공격 속도', 'attackSpeed', 20, .1],
    ['공격력', 'attackFlat', 1000, .1]
  ],
  farm: [
    ['일반 몬스터 데미지', 'normalDamage', 100, .3],
    ['공격 속도', 'attackSpeed', 30, .25],
    ['명중', 'accuracy', 85, .15],
    ['공격력', 'attackFlat', 1000, .2],
    ['크리티컬 확률', 'critRate', 60, .1]
  ],
  chapter: [
    ['명중', 'accuracy', 90, .2],
    ['공격력', 'attackFlat', 1000, .25],
    ['일반 몬스터 데미지', 'normalDamage', 100, .15],
    ['보스 데미지', 'bossDamage', 100, .15],
    ['최대 HP', 'maxHp', 5000, .15],
    ['방어력', 'playerDefense', 3000, .1]
  ],
  pvp: [
    ['명중', 'accuracy', 90, .2],
    ['최대 HP', 'maxHp', 5000, .2],
    ['방어력', 'playerDefense', 3000, .2],
    ['공격력', 'attackFlat', 1000, .2],
    ['공격 속도', 'attackSpeed', 20, .1],
    ['크리티컬 확률', 'critRate', 60, .1]
  ]
};

const DPS_GAP_MAP = {
  bossDamage: ['bossDamage', '보스 데미지', 'boss'],
  normalDamage: ['normalDamage', '일반 몬스터 데미지', 'farm'],
  critRate: ['critRate', '크리티컬 확률', 'boss'],
  critDamage: ['critDamage', '크리티컬 데미지', 'boss'],
  damage: ['damage', '데미지', 'boss'],
  damageAmp: ['damageAmp', '데미지 증폭', 'boss'],
  finalDamage: ['finalDamage', '최종 데미지', 'boss'],
  attackFlat: ['attackFlat', '공격력', 'boss']
};

function officialSingleHitModel(type, delta = {}, options = {}) {
  const read = id => {
    const base = contentBaseline(id) ?? 0;
    return base + Number(delta[id] || 0);
  };
  const row = selectedStageRow();
  const targetDefense = stageAverage(row, 'Defence_min', 'Defence_max') ?? row?.defence ?? null;
  const targetEvasion = stageAverage(row, 'AvoidChance_min', 'AvoidChance_max') ?? row?.avoid ?? null;
  const accuracy = read('accuracy');
  const evasionGap = targetEvasion === null ? 0 : Math.max(0, targetEvasion - accuracy);
  const hitChance = targetEvasion === null ? 1 : 1 - Math.min(700, evasionGap) / 1000;
  const penetration = Math.min(1000, Math.max(0, read('defPen') * 10));
  const defenseAfter = targetDefense === null ? null : targetDefense * (1000 - penetration) / 1000;
  const defenseFactor = defenseAfter === null ? 1 : 5000 / (defenseAfter + 6000);
  const attack = Math.max(1, read('attackFlat') * pct(read('attackPct')));
  const pctFn = id => 1 + read(id) / 100;
  const targetFactor = type === 'boss' ? pctFn('bossDamage') : (type === 'farm' ? pctFn('normalDamage') : 1);
  const basic = options.attackType === 'skill' ? 0 : read('basicDamage');
  const skill = options.attackType === 'basic' ? 0 : read('skillDamage');
  const attackTypeFactor = options.attackType ? 1 + (options.attackType === 'skill' ? skill : basic) / 100 : (1 + (basic + skill) / 200);
  const critChance = Math.min(100, Math.max(0, read('critRate'))) / 100;
  const critDamage = Math.max(0, read('critDamage')) / 100;
  const criticalFactor = 1 + critChance * critDamage;
  const min = read('minDamage'), max = read('maxDamage');
  const minMaxFactor = min > 0 && max > 0 ? (min + max) / 200 : 1;
  const skillCoefficient = options.attackType === 'skill' ? Math.max(0, Number(options.skillCoefficient) || 1) : Math.max(0, read('skillCoefficient') / 100 || 1);
  const factor = defenseFactor * pctFn('damage') * pctFn('damageAmp') * targetFactor * attackTypeFactor * criticalFactor * minMaxFactor * pctFn('finalDamage') * skillCoefficient;
  return {
    value: attack * factor * hitChance,
    factor,
    hitChance,
    targetDefense,
    targetEvasion,
    defenseAfter,
    knownTarget: targetDefense !== null || targetEvasion !== null
  };
}

function dpsGapAdvice(type) {
  const supported = [], unsupported = [], mode = type === 'farm' ? 'farm' : 'boss', row = selectedStageRow();
  (contentRules[type] || []).forEach(([label, id, target]) => {
    const current = contentBaseline(id);
    if (current === null) { unsupported.push(`${label}: 현재값 미입력`); return; }
    let effectiveTarget = target;
    if (id === 'accuracy') {
      const stageEvasion = stageAverage(row, 'AvoidChance_min', 'AvoidChance_max') ?? row?.avoid ?? null;
      if (stageEvasion !== null) effectiveTarget = Math.ceil(stageEvasion);
    }
    const gap = Math.max(0, effectiveTarget - current);
    if (gap <= 0) return;
    const map = DPS_GAP_MAP[id];
    if (!map) { unsupported.push(`${label}: 공식 단일피해 모델 미지원`); return; }
    const before = officialSingleHitModel(map[2] || mode);
    const after = officialSingleHitModel(map[2] || mode, { [id]: gap });
    if (!Number.isFinite(before.value) || before.value <= 0 || !Number.isFinite(after.value)) {
      unsupported.push(`${label}: 현재 공격력·스테이지 기준값 필요`);
      return;
    }
    supported.push({ label, gap, gain: (after.value / before.value - 1) * 100, target: effectiveTarget, current, official: true });
  });
  supported.sort((a, b) => b.gain - a.gain);
  return { supported, unsupported };
}

function officialModelSummary(type) {
  const mode = type === 'farm' ? 'farm' : 'boss';
  const model = officialSingleHitModel(mode);
  const hp = stageHpAverage(selectedStageRow(), mode);
  const parts = [];
  if (model.knownTarget) {
    parts.push(`명중 기대값 ${(model.hitChance * 100).toFixed(1)}% · 방어 ${Math.round(model.targetDefense || 0)} · 방어 관통 후 ${Math.round(model.defenseAfter || 0)}`);
  } else {
    parts.push('스테이지 방어력·회피 데이터 없음');
  }
  if (hp !== null && model.value > 0) {
    parts.push(`${mode === 'farm' ? '일반' : '보스'} HP ${Math.round(hp).toLocaleString()} · 단일 타격당 약 ${Math.round(model.value).toLocaleString()} (필요 타격 약 ${(hp / model.value).toFixed(1)}회)`);
  }
  return `공식 기본 피해 모델: ${parts.join(' · ')}`;
}

function officialCycleSummary(type) {
  const interval = contentBaseline('attackInterval') || 1;
  const coefficient = (contentBaseline('skillCoefficient') || 100) / 100;
  const cooldown = (contentBaseline('cooldownReductionSec') || 5);
  if (!(interval > 0 && coefficient > 0 && cooldown > 0)) {
    return '전투 주기 입력 없음 · 기본 공격 간격·주력 스킬 계수·쿨타임을 모두 입력하면 참고 DPS를 계산합니다.';
  }
  const mode = type === 'farm' ? 'farm' : 'boss';
  const basic = officialSingleHitModel(mode, {}, { attackType: 'basic' }).value;
  const skill = officialSingleHitModel(mode, {}, { attackType: 'skill', skillCoefficient: coefficient }).value;
  const attacks = Math.max(0, Math.floor(cooldown / interval));
  const dps = (skill + basic * attacks) / cooldown;
  const hp = stageHpAverage(selectedStageRow(), mode);
  const clear = hp !== null && dps > 0 ? ` · HP ${Math.round(hp).toLocaleString()} 기준 예상 ${(hp / dps).toFixed(1)}초` : '';
  return `주기 참고 DPS ${Math.round(dps).toLocaleString()}${clear} · 쿨타임 동안 기본 공격 ${attacks}회 + 스킬 1회 · 스킬 계수 ${coefficient}`;
}

function optimizeContent() {
  const type = $('contentType')?.value || 'boss';
  const g = contentGuides[type] || contentGuides.boss;
  const rules = contentRules[type] || [];
  const stage = selectedStageRow();
  const actual = rules.map(([label, id, target, weight]) => {
    const raw = $(id)?.value;
    const value = (raw === '' || raw === undefined) ? null : Number(raw);
    const gap = value === null ? null : Math.max(0, target - value);
    return { label, id, target, weight, value, gap, score: gap === null ? 0 : gap / target * weight };
  }).filter(x => x.value !== null).sort((a, b) => b.score - a.score);
  const missing = rules.filter(([, id]) => !$(id) || $(id).value === '').map(x => x[0]);
  const top = actual.slice(0, 3);
  const gapAdvice = dpsGapAdvice(type);
  const target = $('contentTarget')?.value?.trim() || '';

  let verdict = '';
  if (!actual.length) {
    verdict = '실제 스탯이 없어 일반론만 표시합니다.';
    if ($('contentVerdict')) $('contentVerdict').className = 'verdict warn';
  } else {
    verdict = `${g.title} 기준 현재 보정 우선순위: ${top.map(x => x.label).join(' → ') || '추가 입력 필요'}`;
    if ($('contentVerdict')) $('contentVerdict').className = 'verdict good';
  }
  if ($('contentVerdict')) $('contentVerdict').textContent = verdict;

  const stageInfoText = stage ? $('stageInfo')?.textContent || '선택됨' : '선택하지 않음';
  const summaryText = `[콘텐츠 최적화]
목표: ${g.title}${target ? ' · ' + target : ''}

스테이지 참고
${stageInfoText}

일반론
${g.items.map(x => `- ${x[0]}: ${x[1]}`).join('\n')}

기준값 부족도(휴리스틱)
${top.length ? top.map((x, i) => `${i + 1}. ${x.label} — 현재 ${x.value}, 초기 기준 ${x.target}, 부족도 ${(x.gap / x.target * 100).toFixed(1)}%`).join('\n') : '실제 스탯을 입력하세요.'}

공식 기본 피해 모델에서 기준값까지 올렸을 때 예상 DPS 증가
${officialModelSummary(type)}
${officialCycleSummary(type)}
${gapAdvice.supported.length ? gapAdvice.supported.map((x, i) => `${i + 1}. ${x.label} +${x.gap} → 예상 +${x.gain.toFixed(2)}% · 현재 ${x.current}, 기준 ${x.target}`).join('\n') : '계산 가능한 스탯이 없습니다.'}
${gapAdvice.unsupported.length ? `\n추가 모델 필요\n${gapAdvice.unsupported.map(x => `- ${x}`).join('\n')}` : ''}

아직 입력하지 않은 항목
${missing.length ? missing.join(', ') : '없음'}

주의: 피해 기본식은 공식 안내의 공격력·방어력·명중·데미지 계열 순서를 반영합니다.`;

  if ($('contentSummary')) $('contentSummary').textContent = summaryText;
}

/* ==========================================================================
   Combat Power, Damage Calculation & Marginal Stat Efficiencies (Tab 1)
   ========================================================================== */

function readInputs(extra = {}) {
  const target = $('targetType')?.value || 'normal';
  const job = DATA.jobs?.jobs?.[$('job')?.value] || {};
  const rawStats = { STR: n('statSTR'), DEX: n('statDEX'), INT: n('statINT'), LUK: n('statLUK') };
  const mappedMain = (job.main || []).reduce((sum, key) => sum + (rawStats[key] || 0), 0);
  const mappedSub = (job.sub || []).reduce((sum, key) => sum + (rawStats[key] || 0), 0);
  const useJobStats = $('statInputMode')?.value === 'job';
  let main = (useJobStats ? mappedMain : n('mainStat')) * pct(n('mainStatPct'));
  let sub = useJobStats ? mappedSub : n('subStat');

  const stats = {
    attackFlat: n('attackFlat'),
    attackPct: n('attackPct'),
    maxHp: n('maxHp'),
    playerDefense: n('playerDefense'),
    maxMp: n('maxMp'),
    evasion: n('evasion'),
    statusDamage: n('statusDamage'),
    buffDuration: n('buffDuration'),
    companionSummonDuration: n('companionDuration'),
    fixedCooldownReductionSeconds: n('cooldownReductionSec'),
    cooldownReductionPercent: n('cooldownReductionPct'),
    basicAttackTargetCountIncrease: n('extraTargets'),
    receivedDamageReduction: n('dmgReduction'),
    mainStat: main,
    subStat: sub,
    statBased: main / 100 + sub / 400,
    damage: n('damage'),
    damageAmp: n('damageAmp'),
    finalDamage: n('finalDamage'),
    critRate: n('critRate'),
    critDamage: n('critDamage'),
    minDamage: n('minDamage'),
    maxDamage: n('maxDamage'),
    mastery: n('mastery'),
    skillCoefficient: n('skillCoefficient'),
    attackInterval: n('attackInterval') || 1,
    attackSpeed: n('attackSpeed'),
    attackSpeedAdditions: [],
    defPenAdditions: [],
    targetDefense: n('targetDefense'),
    targetMaxHp: n('targetMaxHp'),
    targetReceivedDamageReduction: n('targetTaken'),
    pvpContent: $('pvpContent')?.value || 'arena',
    defPen: n('defPen'),
    bossDamage: n('bossDamage'),
    normalDamage: n('normalDamage'),
    targetTaken: n('targetTaken'),
    basicDamage: n('basicDamage'),
    skillDamage: n('skillDamage'),
    accuracy: n('accuracy'),
    skillLevels: {
      first: n('skillLevel1') || 1,
      second: n('skillLevel2') || 1,
      third: n('skillLevel3') || 1,
      fourth: n('skillLevel4') || 0,
      all: 0
    },
    mainStatPerLevel1: n('mainStatPerLevel1') || 10,
    masteries: { main80k: 0, sub25k: 0 },
    target,
    job,
    level: n('level') || 100
  };

  // Add Cumulative Equipped Stats from 7-Slot Companion Lineup
  const companionTotals = companionStatTotals(companionSelections());
  for (const [key, val] of Object.entries(companionTotals)) {
    const v = Number(val) || 0;
    if (!v) continue;
    if (key === 'attackPlus') stats.attackFlat += v;
    else if (key === 'mainPct') stats.mainStat *= pct(v);
    else if (key === 'damage') stats.damage += v;
    else if (key === 'amp') stats.damageAmp += v;
    else if (key === 'bossDamage') stats.bossDamage += v;
    else if (key === 'normalDamage') stats.normalDamage += v;
    else if (key === 'basicDamage') stats.basicDamage += v;
    else if (key === 'skillDamage') stats.skillDamage += v;
    else if (key === 'attackSpeed') {
      stats.attackSpeedAdditions.push(v);
      stats.attackSpeed += v;
    }
    else if (key === 'critRate') stats.critRate += v;
    else if (key === 'critDamage') stats.critDamage += v;
    else if (key === 'minDamage') stats.minDamage += v;
    else if (key === 'maxDamage') stats.maxDamage += v;
    else if (key === 'finalDamage') stats.finalDamage += v;
  }

  // Add manual single companion effect if preset / legacy
  const singleCompanion = selectedCompanionEffect();
  if (singleCompanion && !Object.keys(companionTotals).length) {
    for (const [key, val] of Object.entries(singleCompanion.values)) {
      if (key === 'attackPlus') stats.attackFlat += Number(val) || 0;
      else if (key === 'maxDamage') stats.maxDamage += Number(val) || 0;
      else if (key === 'bossDamage') stats.bossDamage += Number(val) || 0;
      else if (key === 'normalDamage') stats.normalDamage += Number(val) || 0;
      else if (key === 'basicDamage') stats.basicDamage += Number(val) || 0;
      else if (key === 'skillDamage') stats.skillDamage += Number(val) || 0;
      else if (key === 'attackSpeed') {
        stats.attackSpeedAdditions.push(Number(val) || 0);
        stats.attackSpeed += Number(val) || 0;
      }
      else if (key === 'critRate') stats.critRate += Number(val) || 0;
      else if (key === 'critDamage') stats.critDamage += Number(val) || 0;
      else if (key === 'minDamage') stats.minDamage += Number(val) || 0;
      else if (key === 'mainPct') stats.mainStat *= pct(val);
    }
  }

  // Extra stat adjustments (e.g., from cube simulation or efficiency tests)
  Object.entries(extra).forEach(([k, v]) => {
    if (k === 'MAIN_STAT_FLAT') stats.mainStat += v;
    else if (k === 'MAIN_STAT_PCT') stats.mainStat *= pct(v);
    else if (k === 'SUB_STAT_FLAT') stats.subStat += v;
    else if (k === 'SUB_STAT_PCT') stats.subStat *= pct(v);
    else if (k === 'MAX_HP') stats.maxHp += Number(v) || 0;
    else if (k === 'PLAYER_DEFENSE') stats.playerDefense += Number(v) || 0;
    else if (k === 'MAX_MP') stats.maxMp += Number(v) || 0;
    else if (k === 'FIXED_CDR') stats.fixedCooldownReductionSeconds += Number(v) || 0;
    else if (k === 'COOLDOWN_PCT') stats.cooldownReductionPercent += Number(v) || 0;
    else if (k === 'ATK_BASIC_DMG') stats.basicDamage += Number(v) || 0;
    else if (k === 'SKILL_DMG') stats.skillDamage += Number(v) || 0;
    else if (k === 'ATK_FLAT') stats.attackFlat += v;
    else if (k === 'ATK_PCT') stats.attackPct += v;
    else if (k === 'DMG') stats.damage += v;
    else if (k === 'DMG_AMP') stats.damageAmp += v;
    else if (k === 'FINAL_DMG') stats.finalDamage += v;
    else if (k === 'BOSS_DMG') stats.bossDamage += v;
    else if (k === 'NORMAL_DMG') stats.normalDamage += v;
    else if (k === 'DEF_PEN') {
      stats.defPenAdditions.push(Number(v) || 0);
      stats.defPen += Number(v) || 0;
    } else if (k === 'ATK_SPEED') {
      stats.attackSpeedAdditions.push(Number(v) || 0);
      stats.attackSpeed += Number(v) || 0;
    } else if (k === 'CRIT_RATE') stats.critRate += v;
    else if (k === 'CRIT_DMG') stats.critDamage += v;
    else if (k === 'MIN_DAMAGE') stats.minDamage += v;
    else if (k === 'MAX_DAMAGE') stats.maxDamage += v;
    else if (k === 'BUFF_DURATION') stats.buffDuration += v;
    else if (k === 'COMPANION_DURATION') stats.companionSummonDuration += v;
    else if (k === 'TARGET_COUNT_INC') stats.basicAttackTargetCountIncrease += v;
    else if (k === 'ALL_SKILL_LEVEL') stats.skillLevels.all = (stats.skillLevels.all || 0) + v;
  });

  stats.statBased = stats.mainStat / 100 + stats.subStat / 400;
  return stats;
}

function calculate(extra = {}) {
  const inputs = readInputs(extra);
  return inputs.target === 'pvp'
    ? calculatePvpDamage(inputs, DATA.combat || {})
    : calculateDamage(inputs, DATA.combat || {});
}

function calculatePower(extra = {}) {
  return calculateCombatPower(readInputs(extra), DATA.combat || {});
}

function stageSensitivity() {
  const target = $('targetType')?.value || 'normal';
  const candidates = [
    ['공격력', 'ATK_FLAT', 100],
    ['데미지', 'DMG', 10],
    [target === 'boss' ? '보스 데미지' : '일반 몬스터 데미지', target === 'boss' ? 'BOSS_DMG' : 'NORMAL_DMG', 10],
    ['방어 관통력', 'DEF_PEN', 10],
    ['주스탯', 'MAIN_STAT_FLAT', 1000],
    ['크리티컬 데미지', 'CRIT_DMG', 10],
    ['공격 속도', 'ATK_SPEED', 10]
  ];
  const base = calculate();
  return candidates.map(([name, stat, amount]) => ({
    name,
    stat,
    amount,
    delta: calculate({ [stat]: amount }).dps - base.dps
  })).sort((a, b) => b.delta / a.amount - a.delta / a.amount);
}

function renderStageVerdict() {
  const box = $('stageVerdict');
  if (!box) return;
  const row = selectedStageRow(), r = calculate(), hp = n('targetMaxHp'), limit = row?.time_sec || 60;
  if (!row || !hp) {
    box.className = 'stage-verdict';
    box.innerHTML = '목표 스테이지를 선택하면 클리어 가능성과 병목을 진단합니다.';
    return;
  }
  const total = r.dps * limit, ratio = hp ? total / hp : 0;
  const clear = total >= hp;
  const ranked = stageSensitivity().slice(0, 3);
  box.className = 'stage-verdict ' + (clear ? 'good' : 'warn');
  box.innerHTML = `<strong>${escapeHtml(row.stage)} 목표 · ${clear ? '클리어 가능' : '현재 화력 부족'}</strong>
    <div class="stage-meta">${fmt(r.dps)} DPS × ${limit}초 = ${fmt(total)} · 적 HP ${fmt(hp)} · 필요 비율 ${ratio.toFixed(2)}배</div>
    <div class="bottleneck-list">
      <span><b>1순위 병목</b><b>${escapeHtml(ranked[0]?.name || '분석 중')} +${fmt(ranked[0]?.delta || 0)} DPS</b></span>
      <span><b>2순위</b><b>${escapeHtml(ranked[1]?.name || '—')} +${fmt(ranked[1]?.delta || 0)} DPS</b></span>
      <span><b>3순위</b><b>${escapeHtml(ranked[2]?.name || '—')} +${fmt(ranked[2]?.delta || 0)} DPS</b></span>
    </div>`;
}

function renderStatEfficiencies() {
  const box = $('statEfficienciesRoot') || $('statEfficiencyBox');
  if (!box) return;
  const inputs = readInputs();
  const effs = calculateStatEfficiencies(inputs, DATA.combat || {});
  if (!effs.length) {
    box.innerHTML = '';
    return;
  }
  const topRows = effs.slice(0, 6).map((item, index) =>
    `<div class="efficiency-row">
      <span class="eff-rank">${index + 1}위</span>
      <span class="eff-label">${escapeHtml(item.label)}</span>
      <span class="eff-delta">+${fmt(item.deltaDps)} DPS</span>
      <span class="eff-badge">${item.ratioPct >= 0 ? '+' : ''}${item.ratioPct.toFixed(2)}%</span>
    </div>`
  ).join('');
  box.innerHTML = `<div class="efficiency-grid">${topRows}</div>`;
}

function renderSpecUpGuide() {
  const box = $('specUpGuideContent');
  if (!box) return;
  const target = $('targetType')?.value || 'normal';
  const r = calculate();
  const dpsVal = r.dps;
  let targetLabel = target === 'boss' ? '보스 몬스터 (레이드·월드보스·길드토벌)' : target === 'pvp' ? 'PvP 대항전 (아레나·콜로세움)' : '일반 몬스터 (챕터 사냥·던전)';
  let priorityStats = [];
  if (target === 'boss') {
    priorityStats = [
      { name: '보스 몬스터 데미지%', reason: '보스 대상 직접 곱연산 적용 (동료 레전더리/유니크 1순위 스탯)' },
      { name: '크리티컬 데미지%', reason: '크리티컬 확률 확보 후 최고의 DPS 증폭 multiplier' },
      { name: '방어 관통력%', reason: '보스 적 방어력 감쇄를 통한 데미지 감소 무력화' },
      { name: '최종 데미지%', reason: '모든 공격력 계산의 최후 1.xx배 곱연산' }
    ];
  } else if (target === 'pvp') {
    priorityStats = [
      { name: '명중률% & 크리티컬 저항%', reason: '상대 회피/크저 차감 후 순수 유효 피해 전달' },
      { name: '방어 관통력%', reason: 'PvP 고방어력 상대 극복 필수 스탯' },
      { name: '받는 피해 감소%', reason: 'PvP 승패 결정 생존력 향상' }
    ];
  } else {
    priorityStats = [
      { name: '일반 몬스터 데미지%', reason: '챕터 사냥 및 일반 던전 몬스터 대상 직접 곱연산' },
      { name: '기본 공격 데미지%', reason: '동료 스킬 및 기본 타격 DPS 비중 강화' },
      { name: '공격 속도%', reason: '상한선(150%)까지 빠른 타격 주기 확보' }
    ];
  }
  box.innerHTML = `<div style="display:grid;gap:10px;margin-top:6px;">
    <div style="background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:10px 12px;">
      <span style="font-size:12px;color:var(--muted);font-weight:700;">🎯 대상 콘텐츠: ${targetLabel}</span>
      <div style="font-size:16px;font-weight:900;color:var(--primary-dark);margin-top:2px;">예상 전투 DPS: ${fmt(dpsVal)}</div>
    </div>
    <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;">
      <strong style="font-size:13px;color:var(--ink);">🔥 이 콘텐츠 최적화 1순위 옵션</strong>
      <ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:#475467;">
        ${priorityStats.map(item => `<li style="margin-bottom:4px;"><b>${escapeHtml(item.name)}</b> — ${escapeHtml(item.reason)}</li>`).join('')}
      </ul>
    </div>
  </div>`;
}

function renderJobStatMapping() {
  const box = $('jobStatMapping');
  if (!box) return;
  const job = DATA.jobs?.jobs?.[$('job')?.value];
  if (!job) {
    box.textContent = '직업을 선택하면 주·부 스탯 매핑을 표시합니다.';
    return;
  }
  const mode = $('statInputMode')?.value || 'aggregate';
  const main = (job.main || []).join(', ') || '미확인';
  const sub = (job.sub || []).join(', ') || '미확인';
  box.innerHTML = `주스탯 <b>${main}</b> · 부스탯 <b>${sub}</b> · ${mode === 'job' ? '원시 스탯 입력을 계산에 사용합니다.' : '주·부 스탯 합산값을 직접 사용합니다.'}`;
}

function parseSkillDamageMetrics(effect) {
  if (!effect) return { multiplierPct: 100, hits: 1, totalPct: 100 };
  const m1 = effect.match(/([0-9,.]+)\s*%\s*(?:피해를|의\s*피해를)?\s*([0-9]+)\s*(?:회|타)/);
  if (m1) {
    const pct = parseFloat(m1[1].replace(/,/g, ''));
    const hits = parseInt(m1[2], 10);
    return { multiplierPct: pct, hits, totalPct: pct * hits };
  }
  const m2 = effect.match(/([0-9,.]+)\s*%\s*[×x*]\s*([0-9]+)\s*타?/i);
  if (m2) {
    const pct = parseFloat(m2[1].replace(/,/g, ''));
    const hits = parseInt(m2[2], 10);
    return { multiplierPct: pct, hits, totalPct: pct * hits };
  }
  const m3 = effect.match(/([0-9,.]+)\s*%\s*([0-9,.]+)\s*%\s*피해/);
  if (m3) {
    const p1 = parseFloat(m3[1].replace(/,/g, ''));
    const p2 = parseFloat(m3[2].replace(/,/g, ''));
    return { multiplierPct: p1 + p2, hits: 2, totalPct: p1 + p2 };
  }
  const mSingle = effect.match(/([0-9,.]+)\s*%\s*피해/);
  if (mSingle) {
    const pct = parseFloat(mSingle[1].replace(/,/g, ''));
    return { multiplierPct: pct, hits: 1, totalPct: pct };
  }
  return { multiplierPct: 100, hits: 1, totalPct: 100 };
}

function parseCooldownSeconds(cdText) {
  if (!cdText || cdText.includes('즉시') || cdText === '0' || cdText === '0초') return 0;
  const m = cdText.match(/([0-9.]+)\s*초/);
  return m ? parseFloat(m[1]) : 0;
}

window.applySkillCoefficient = function(val, name) {
  if ($('skillCoefficient')) {
    $('skillCoefficient').value = val;
    renderCombat();
    setStatus(`${name}의 총 계수(${val}%)가 스킬 계수 입력칸에 자동 적용되었습니다.`, 'good');
  }
};

function renderJobSkills() {
  const container = $('jobSkillContent');
  if (!container) return;
  const jobKey = $('job')?.value;
  if (!jobKey || !DATA.jobSkills?.[jobKey]) {
    container.innerHTML = `<div class="small text-muted" style="padding:8px 0;">직업을 선택하면 해당 직업의 1~4차 공식 스킬 계수, 타수, 쿨타임 및 추천 딜사이클을 확인하고 실전 전투 시뮬레이션을 실행할 수 있습니다.</div>`;
    return;
  }

  const jobData = DATA.jobSkills[jobKey];
  const jobName = JOB_NAMES[jobKey] || jobKey;
  const cdrPct = clamp(n('cooldownReductionPct'), 0, 80);
  const cdrSec = n('cooldownReductionSec');
  const atkSpeed = n('attackSpeed');
  const atkInterval = n('attackInterval') || 1;
  const effectiveInterval = Math.max(0.1, atkInterval / (1 + atkSpeed / 100));

  const STAGE_NAMES = { first: '1차 스킬', second: '2차 스킬', third: '3차 스킬', fourth: '4차 스킬' };

  let html = `<div style="display:flex;flex-direction:column;gap:12px;margin-top:6px;">`;

  html += `
    <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div>
        <strong style="color:var(--primary-dark);font-size:13px;">⚔️ ${escapeHtml(jobName)} 스킬 DB</strong>
        <span class="badge official" style="margin-left:6px;font-size:10px;">공식 패치 DB 연동</span>
      </div>
      <div style="font-size:12px;color:var(--ink);">
        실제 타격 주기: <b>${effectiveInterval.toFixed(3)}초</b> (공속 ${atkSpeed}% 적용)
      </div>
    </div>
  `;

  html += `<div id="skillLoadoutPanel"></div>`;

  jobData.stages.forEach(st => {
    const stageTitle = STAGE_NAMES[st.id] || st.id;
    const reqLv = st.id === 'first' ? 10 : st.id === 'second' ? 30 : st.id === 'third' ? 60 : 100;
    html += `
      <div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:#fff;">
        <div style="font-size:13px;font-weight:800;color:var(--ink);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          <span>🔹 ${stageTitle}</span>
          <span style="font-size:11px;color:var(--muted);font-weight:normal;">(해금 Lv.${reqLv})</span>
        </div>
        <div style="display:grid;gap:6px;">
    `;

    (st.active || []).forEach(sk => {
      const metrics = parseSkillDamageMetrics(sk.effect);
      const baseCd = parseCooldownSeconds(sk.cooldown);
      const effCd = baseCd > 0 ? Math.max(4, baseCd * (1 - cdrPct / 100) - cdrSec) : 0;
      const isBurst = baseCd > 0;
      const badge = isBurst
        ? `<span class="badge danger" style="font-size:10px;padding:2px 6px;">쿨타임 (${baseCd}초 → <b>${effCd.toFixed(1)}초</b>)</span>`
        : `<span class="badge success" style="font-size:10px;padding:2px 6px;">기본 공격</span>`;

      html += `
        <div style="background:#f8fafc;border:1px solid var(--line);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
              <strong style="font-size:13px;color:var(--ink);">${escapeHtml(sk.name)}</strong>
              ${badge}
              ${metrics.totalPct > 0 ? `<span style="font-size:11px;font-weight:700;color:var(--primary);">총 계수: ${metrics.totalPct}% (${metrics.multiplierPct}% × ${metrics.hits}타)</span>` : ''}
            </div>
            <p style="margin:0;font-size:11px;color:#475467;line-height:1.4;">${escapeHtml(sk.effect)}</p>
          </div>
          ${metrics.totalPct > 0 ? `
            <button type="button" class="button ghost" style="padding:4px 8px;font-size:11px;white-space:nowrap;align-self:center;" onclick="applySkillCoefficient(${metrics.totalPct}, '${escapeHtml(sk.name)}')">
              🚀 계수 적용
            </button>
          ` : ''}
        </div>
      `;
    });

    if (st.passive && st.passive.length > 0) {
      html += `
        <div style="margin-top:6px;font-size:11px;color:#64748b;background:rgba(241,245,249,0.7);padding:6px 10px;border-radius:6px;line-height:1.5;">
          <strong style="color:var(--ink);">패시브:</strong> ${st.passive.map(p => `<span>${escapeHtml(p.name)} (${escapeHtml(p.effect)})</span>`).join(' · ')}
        </div>
      `;
    }

    html += `</div></div>`;
  });

  html += `
    <div style="background:linear-gradient(135deg, rgba(99,102,241,0.06), rgba(79,70,229,0.1));border:1px solid rgba(99,102,241,0.25);border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <div>
          <strong style="font-size:13px;color:var(--primary-dark);">🎯 실전 딜사이클 전투 시뮬레이터</strong>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">공속과 쿨타임 감소를 반영하여 실제 딜사이클 피해량을 측정합니다.</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="simDuration" style="padding:4px 8px;font-size:12px;border:1px solid var(--line);border-radius:6px;background:#fff;">
            <option value="10">10초 (순간 극딜)</option>
            <option value="30" selected>30초 (던전/보스 기본)</option>
            <option value="60">60초 (장기 지속 딜)</option>
          </select>
          <button type="button" class="button primary" id="runSimulationBtn" style="padding:4px 12px;font-size:12px;">
            ⚔️ 시뮬레이션 실행
          </button>
        </div>
      </div>
      <div id="simulationResultBox"></div>
    </div>
  `;

  html += `</div>`;
  container.innerHTML = html;

  $('runSimulationBtn')?.addEventListener('click', runCombatSimulation);
  renderSkillLoadoutPanel();
}

function runCombatSimulation() {
  const resultBox = $('simulationResultBox');
  if (!resultBox) return;
  const jobKey = $('job')?.value;
  if (!jobKey || !DATA.jobSkills?.[jobKey]) return;

  const duration = Number($('simDuration')?.value || 30);
  const state = loadSkillLoadoutState(jobKey);
  const level = skillLoadoutLevel();
  const models = buildSkillModels(DATA.jobSkills[jobKey], level, state.overrides);

  let basic = models.find(m => m.unlocked && m.isBasic && state.equipped.includes(m.name));
  if (!basic) basic = models.find(m => m.unlocked && m.isBasic) || null;

  let activeSkills = models.filter(m => m.unlocked && !m.isBasic && state.equipped.includes(m.name));
  if (!activeSkills.length) {
    activeSkills = models.filter(m => m.unlocked && !m.isBasic).slice(-LOADOUT_SKILL_SLOTS);
  }

  const { ctx, relative } = skillOptimizerContext(duration);
  const sim = simulateLoadout(basic, activeSkills, ctx);

  let warningBanner = '';
  if (sim.provisional) {
    const warningsText = sim.provisionalWarnings.length ? sim.provisionalWarnings.join(' · ') : '일부 스킬 쿨타임/계수 미확인';
    warningBanner = `<div style="font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px;margin-bottom:8px;">⚠️ 미확인 스킬 포함 경고: ${escapeHtml(warningsText)} (상단 스킬 설정에서 실제 수치를 입력할 수 있습니다.)</div>`;
  }

  const totalHits = sim.usage.reduce((sum, u) => sum + u.hits, 0);
  const shareRows = sim.usage.map(u => {
    const share = sim.total > 0 ? (u.damage / sim.total * 100).toFixed(1) : 0;
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
          <span><b>${escapeHtml(u.name)}</b> (${u.casts ? `시전 ${u.casts}회` : '패시브/추가타'} · ${u.hits}타)</span>
          <span style="font-weight:800;color:var(--primary);">${share}% (${fmt(u.damage)})</span>
        </div>
        <div style="background:#e2e8f0;height:6px;border-radius:3px;overflow:hidden;">
          <div style="background:var(--primary);width:${share}%;height:100%;"></div>
        </div>
      </div>
    `;
  }).join('');

  let resHtml = `
    <div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px;margin-top:10px;">
      ${warningBanner}
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">
        장착 스킬: <b>${escapeHtml(basic?.name || '기본 공격')}</b> + ${activeSkills.map(s => escapeHtml(s.name)).join(', ')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;margin-bottom:12px;">
        <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid var(--line);">
          <span style="font-size:11px;color:var(--muted);font-weight:700;">전투 시간</span>
          <div style="font-size:16px;font-weight:900;color:var(--ink);">${duration}초</div>
        </div>
        <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid var(--line);">
          <span style="font-size:11px;color:var(--muted);font-weight:700;">총 전투 행동/타수</span>
          <div style="font-size:16px;font-weight:900;color:var(--primary);">${sim.actions}행동 / ${fmt(totalHits)}타</div>
        </div>
        <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid var(--line);">
          <span style="font-size:11px;color:var(--muted);font-weight:700;">누적 총 피해량</span>
          <div style="font-size:16px;font-weight:900;color:var(--primary-dark);">${fmt(sim.total)}</div>
        </div>
        <div style="background:#eff6ff;padding:8px 10px;border-radius:6px;border:1px solid #bfdbfe;">
          <span style="font-size:11px;color:#1e40af;font-weight:700;">${relative ? '상대 시뮬레이션 DPS' : '실전 시뮬레이션 DPS'}</span>
          <div style="font-size:16px;font-weight:900;color:#1d4ed8;">${fmt(sim.dps)}</div>
        </div>
      </div>

      <div style="font-size:12px;font-weight:800;color:var(--ink);margin-bottom:6px;">📊 스킬별 딜 지분율 & 발동 횟수</div>
      <div style="display:grid;gap:6px;">
        ${shareRows}
      </div>
    </div>
  `;
  resultBox.innerHTML = resHtml;
}

/* ==========================================================================
   Skill Loadout Optimizer (평타 1 + 스킬 5)
   ========================================================================== */

const SKILL_LOADOUT_KEY = 'maple-growth-lab-skill-loadout-v1';

function loadSkillLoadoutState(jobKey) {
  try {
    const all = JSON.parse(localStorage.getItem(SKILL_LOADOUT_KEY) || '{}');
    return { overrides: {}, equipped: [], ...(all[jobKey] || {}) };
  } catch {
    return { overrides: {}, equipped: [] };
  }
}

function saveSkillLoadoutState(jobKey, state) {
  try {
    const all = JSON.parse(localStorage.getItem(SKILL_LOADOUT_KEY) || '{}');
    all[jobKey] = state;
    localStorage.setItem(SKILL_LOADOUT_KEY, JSON.stringify(all));
  } catch {}
}

function skillLoadoutLevel() {
  const lv = n('level');
  return lv > 0 ? lv : 200;
}

function skillModelKind(m) {
  if (m.isBasic) return ['평타', 'success'];
  if (m.servantPct) return ['그림자', 'official'];
  if (m.buff && !m.directPct && !m.periodic) return ['버프', 'official'];
  if (m.periodic) return ['소환/지속', 'danger'];
  if (m.directPct) return ['공격', 'danger'];
  return ['유틸', ''];
}

function skillModelSummary(m) {
  const parts = [];
  if (m.directPct) parts.push(`${fmt(m.directPct * (1 + (m.passiveBoost || 0) / 100))}%`);
  if (m.periodic) parts.push(`${fmt(m.periodic.pct)}%×${m.periodic.ticks}틱`);
  if (m.passiveBoost) parts.push(`패시브 최종 +${m.passiveBoost}%`);
  if (m.buff) {
    const names = { attackPct: '공%', finalDamage: '최종뎀', damage: '데미지', attackSpeed: '공속', critDamage: '크뎀', critRate: '크확', defPen: '방관', targetTaken: '받피증' };
    const b = Object.entries(m.buff.stats || {}).map(([k, v]) => `${names[k] || k}+${v}%`);
    if (m.servantPct) b.push(`평타 그림자 ${m.servantPct}%`);
    if (b.length) parts.push(`${m.buff.duration}초 ${b.join(' ')}`);
  }
  if (m.cdResetPct) parts.push(`쿨타임 ${m.cdResetPct}% 즉시 감소`);
  return parts.join(' · ') || '피해/버프 없음';
}

function skillOptimizerContext(duration) {
  const inputs = readInputs();
  const isPvp = inputs.target === 'pvp';
  const engine = isPvp ? calculatePvpDamage : calculateDamage;
  const make = (base, s, kind) => ({
    ...base,
    skillCoefficient: 100,
    attackPct: (base.attackPct || 0) + (s.attackPct || 0),
    finalDamage: (base.finalDamage || 0) + (s.finalDamage || 0),
    damage: (base.damage || 0) + (s.damage || 0),
    critRate: (base.critRate || 0) + (s.critRate || 0),
    critDamage: (base.critDamage || 0) + (s.critDamage || 0),
    defPen: (base.defPen || 0) + (s.defPen || 0),
    targetTaken: (base.targetTaken || 0) + (s.targetTaken || 0),
    basicDamage: kind === 'basic' ? base.basicDamage : 0,
    skillDamage: kind === 'skill' ? base.skillDamage : 0
  });
  let base = inputs;
  let relative = false;
  if (!(engine(make(base, {}, 'skill'), DATA.combat || {}).average > 0)) {
    // 스탯 미입력(공격력 0 / 명중 0) 시에도 조합 간 상대 비교는 가능하도록 기준값을 채운다.
    base = { ...inputs, attackFlat: inputs.attackFlat || 1000, accuracy: inputs.accuracy || 100 };
    relative = true;
  }
  return {
    relative,
    ctx: {
      duration,
      attackInterval: inputs.attackInterval || 1,
      attackSpeed: inputs.attackSpeed || 0,
      attackSpeedCap: Number(DATA.combat?.caps?.attackSpeed || 1500) / 10,
      cooldownReductionPercent: inputs.cooldownReductionPercent || 0,
      fixedCooldownReductionSeconds: inputs.fixedCooldownReductionSeconds || 0,
      boss: inputs.target === 'boss',
      damageFor: (s, kind) => engine(make(base, s, kind), DATA.combat || {}).average
    }
  };
}

function renderSkillLoadoutPanel() {
  const panel = $('skillLoadoutPanel');
  const jobKey = $('job')?.value;
  if (!panel || !jobKey || !DATA.jobSkills?.[jobKey]) return;
  const level = skillLoadoutLevel();
  const state = loadSkillLoadoutState(jobKey);
  const models = buildSkillModels(DATA.jobSkills[jobKey], level, state.overrides);
  const sorted = [...models].sort((a, b) => (b.unlocked - a.unlocked) || (b.isBasic - a.isBasic) || a.requiredLevel - b.requiredLevel);
  const unknownCd = models.filter(m => m.unlocked && !m.isBasic && !m.cooldownKnown).length;

  const rows = sorted.map(m => {
    const [kind, tone] = skillModelKind(m);
    const ov = state.overrides[m.name] || {};
    const equipped = state.equipped.includes(m.name);
    const cdCell = m.isBasic
      ? '<span class="small" style="color:var(--muted);">—</span>'
      : `<input type="number" min="1" step="0.5" class="skill-cd-input" data-skill="${escapeHtml(m.name)}" value="${ov.cooldown ?? ''}" placeholder="${m.cooldownKnown ? m.baseCooldown : `${DEFAULT_UNKNOWN_COOLDOWN}?`}" style="width:62px;padding:3px 5px;font-size:11px;border:1px solid ${m.cooldownKnown ? 'var(--line)' : '#f59e0b'};border-radius:5px;${m.cooldownKnown ? '' : 'background:#fffbeb;'}" title="${m.cooldownKnown ? 'DB 쿨타임 (덮어쓰기 가능)' : '쿨타임 미확인: 게임 내 값을 입력하세요'}">`;
    const coefCell = m.isBasic
      ? '<span class="small" style="color:var(--muted);">—</span>'
      : `<input type="number" min="0" step="10" class="skill-coef-input" data-skill="${escapeHtml(m.name)}" value="${ov.coef ?? ''}" placeholder="${m.damageUnknown ? '필요' : '자동'}" style="width:70px;padding:3px 5px;font-size:11px;border:1px solid ${m.damageUnknown ? '#f59e0b' : 'var(--line)'};border-radius:5px;${m.damageUnknown ? 'background:#fffbeb;' : ''}" title="1회 시전 총 계수(%) 직접 입력">`;
    return `
      <tr style="${m.unlocked ? '' : 'opacity:.45;'}border-top:1px solid var(--line);">
        <td style="padding:5px 4px;text-align:center;"><input type="checkbox" class="skill-equip-input" data-skill="${escapeHtml(m.name)}" data-basic="${m.isBasic ? 1 : 0}" ${equipped ? 'checked' : ''} ${m.unlocked ? '' : 'disabled'}></td>
        <td style="padding:5px 4px;">
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;"><b style="font-size:12px;">${escapeHtml(m.name)}</b><span class="badge ${tone}" style="font-size:10px;padding:1px 5px;">${kind}</span>${m.unlocked ? '' : `<span class="small" style="color:var(--muted);">Lv.${m.requiredLevel} 해금</span>`}</div>
          <div style="font-size:10.5px;color:#475467;">${escapeHtml(skillModelSummary(m))}${m.notes.length ? ` <span style="color:#b45309;">· ${escapeHtml(m.notes.join(' · '))}</span>` : ''}</div>
        </td>
        <td style="padding:5px 4px;">${cdCell}</td>
        <td style="padding:5px 4px;">${coefCell}</td>
      </tr>`;
  }).join('');

  panel.innerHTML = `
    <div style="border:1px solid rgba(16,185,129,.35);background:linear-gradient(135deg,rgba(16,185,129,.05),rgba(59,130,246,.06));border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <div>
          <strong style="font-size:13px;color:#047857;">🧠 스킬 장착 최적화 (평타 1 + 스킬 ${LOADOUT_SKILL_SLOTS})</strong>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">Lv.${level} 기준 해금 스킬로 가능한 모든 조합을 자동 전투 시뮬레이션해 최고 DPS 조합을 찾습니다. 체크 = 현재 장착(비교용).</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <select id="loadoutDuration" style="padding:4px 8px;font-size:12px;border:1px solid var(--line);border-radius:6px;background:#fff;">
            <option value="30">30초</option>
            <option value="60" selected>60초</option>
            <option value="120">120초</option>
            <option value="180">180초</option>
          </select>
          <button type="button" class="button primary" id="runLoadoutOptimizerBtn" style="padding:4px 12px;font-size:12px;">🧠 최적 조합 찾기</button>
        </div>
      </div>
      ${unknownCd ? `<div style="font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px;margin-bottom:8px;">⚠️ 이 직업의 공식 패치노트에는 쿨타임이 없어 <b>${unknownCd}개 스킬</b>을 ${DEFAULT_UNKNOWN_COOLDOWN}초로 가정합니다. 주황색 칸에 게임 내 쿨타임을 입력하면 결과가 정확해집니다.</div>` : ''}
      <div style="max-height:340px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8fafc;font-size:11px;color:var(--muted);"><th style="padding:5px 4px;">장착</th><th style="padding:5px 4px;text-align:left;">스킬</th><th style="padding:5px 4px;">쿨타임(초)</th><th style="padding:5px 4px;">계수(%)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="loadoutResultBox" style="margin-top:10px;"></div>
    </div>`;

  const persist = () => saveSkillLoadoutState(jobKey, state);
  panel.querySelectorAll('.skill-cd-input,.skill-coef-input').forEach(el => el.addEventListener('change', () => {
    const name = el.dataset.skill;
    const key = el.classList.contains('skill-cd-input') ? 'cooldown' : 'coef';
    state.overrides[name] = { ...(state.overrides[name] || {}) };
    if (el.value === '') delete state.overrides[name][key]; else state.overrides[name][key] = Number(el.value);
    persist();
    renderSkillLoadoutPanel();
  }));
  panel.querySelectorAll('.skill-equip-input').forEach(el => el.addEventListener('change', () => {
    const name = el.dataset.skill;
    if (el.checked && el.dataset.basic === '1') {
      // 평타 슬롯은 1개: 다른 평타 체크 해제
      const basicNames = models.filter(m => m.isBasic).map(m => m.name);
      state.equipped = state.equipped.filter(x => !basicNames.includes(x));
    }
    if (el.checked && el.dataset.basic !== '1') {
      const skillNames = models.filter(m => !m.isBasic).map(m => m.name);
      const current = state.equipped.filter(x => skillNames.includes(x));
      if (current.length >= LOADOUT_SKILL_SLOTS) {
        el.checked = false;
        setStatus(`스킬 슬롯은 최대 ${LOADOUT_SKILL_SLOTS}개입니다. 다른 스킬을 먼저 해제하세요.`, 'warn');
        return;
      }
    }
    state.equipped = el.checked ? [...new Set([...state.equipped, name])] : state.equipped.filter(x => x !== name);
    persist();
    renderSkillLoadoutPanel();
  }));
  $('runLoadoutOptimizerBtn')?.addEventListener('click', () => runSkillLoadoutOptimizer(jobKey, models, state));
}

function runSkillLoadoutOptimizer(jobKey, models, state) {
  const box = $('loadoutResultBox');
  if (!box) return;
  const duration = Number($('loadoutDuration')?.value || 60);
  const { ctx, relative } = skillOptimizerContext(duration);
  const result = optimizeLoadout({ models, ctx, top: 5 });
  if (!result.best) {
    box.innerHTML = '<div class="small">해금된 스킬이 없습니다. 캐릭터 레벨을 확인하세요.</div>';
    return;
  }
  const best = result.best;

  // 현재 장착 비교
  const eqBasic = models.find(m => m.unlocked && m.isBasic && state.equipped.includes(m.name)) || null;
  const eqSkills = models.filter(m => m.unlocked && !m.isBasic && state.equipped.includes(m.name));
  const current = (eqBasic || eqSkills.length) ? simulateLoadout(eqBasic, eqSkills, ctx) : null;
  const gain = current && current.total > 0 ? (best.total / current.total - 1) * 100 : null;
  const sameAsCurrent = current && eqBasic?.name === best.basic?.name
    && eqSkills.length === best.skills.length && best.skills.every(s => eqSkills.some(e => e.name === s.name));

  const chip = (name, tone = '#ecfdf5', border = '#6ee7b7') => `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${tone};border:1px solid ${border};font-size:12px;font-weight:700;margin:2px;">${escapeHtml(name)}</span>`;
  const shareRows = best.usage.map(u => {
    const share = best.total > 0 ? u.damage / best.total * 100 : 0;
    return `<div style="margin-top:4px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;"><span><b>${escapeHtml(u.name)}</b> ${u.casts ? `· 시전 ${u.casts}회` : ''}</span><span style="font-weight:800;color:var(--primary);">${share.toFixed(1)}%</span></div>
      <div style="background:#e2e8f0;height:5px;border-radius:3px;overflow:hidden;"><div style="background:#10b981;width:${share}%;height:100%;"></div></div>
    </div>`;
  }).join('');
  const altRows = result.ranking.map((r, i) => `
    <tr style="border-top:1px solid var(--line);">
      <td style="padding:4px;text-align:center;">${i + 1}</td>
      <td style="padding:4px;font-size:11px;">${escapeHtml(r.basic?.name || '—')} + ${r.skills.map(s => escapeHtml(s.name)).join(', ')}</td>
      <td style="padding:4px;text-align:right;font-weight:700;">${(r.total / best.total * 100).toFixed(1)}%</td>
    </tr>`).join('');
  const warnings = [...new Set([best.basic, ...best.skills].filter(Boolean).flatMap(m => m.notes.map(n => `${m.name}: ${n}`)))];
  const marginalRows = best.skills.map(s => {
    const without = simulateLoadout(best.basic, best.skills.filter(x => x !== s), ctx);
    return { name: s.name, loss: best.total > 0 ? (1 - without.total / best.total) * 100 : 0 };
  }).sort((a, b) => b.loss - a.loss).map(x => `
    <div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-bottom:1px dashed var(--line);">
      <span>${escapeHtml(x.name)}</span><b style="color:${x.loss > 0.05 ? '#b91c1c' : 'var(--muted)'};">${x.loss > 0.005 ? `−${x.loss.toFixed(2)}%` : '영향 없음'}</b>
    </div>`).join('');

  box.innerHTML = `
    <div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px;">
      <div style="font-size:12px;font-weight:800;color:#047857;margin-bottom:6px;">🏆 최적 조합 (${result.evaluated.toLocaleString()}개 조합 전수 탐색 · ${duration}초 · ${ctx.boss ? '보스' : '일반'} 대상)</div>
      <div>${chip(`평타: ${best.basic?.name || '없음'}`, '#eff6ff', '#93c5fd')}${best.skills.map(s => chip(s.name)).join('')}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">권장 시전 우선순위(슬롯 배치 순서): ${best.castOrder.map(escapeHtml).join(' → ')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px;"><span style="font-size:11px;color:#166534;font-weight:700;">${relative ? '상대 DPS 지수' : '시뮬레이션 DPS'}</span><div style="font-size:16px;font-weight:900;color:#15803d;">${fmt(best.dps)}</div></div>
        <div style="background:#f8fafc;border:1px solid var(--line);border-radius:6px;padding:8px;"><span style="font-size:11px;color:var(--muted);font-weight:700;">${duration}초 누적 피해</span><div style="font-size:16px;font-weight:900;">${fmt(best.total)}</div></div>
        <div style="background:${gain === null ? '#f8fafc' : gain > 0.05 ? '#fef2f2' : '#f0fdf4'};border:1px solid var(--line);border-radius:6px;padding:8px;"><span style="font-size:11px;color:var(--muted);font-weight:700;">현재 장착 대비</span><div style="font-size:16px;font-weight:900;">${gain === null ? '장착 체크 필요' : sameAsCurrent ? '이미 최적 ✅' : `+${gain.toFixed(2)}%`}</div></div>
      </div>
      <button type="button" class="button secondary" id="applyBestLoadoutBtn" style="padding:4px 10px;font-size:12px;">✅ 이 조합을 현재 장착으로 저장</button>
      <div style="font-size:12px;font-weight:800;margin:12px 0 2px;">📊 딜 지분 (직접 피해)</div>
      ${shareRows}
      <div style="font-size:12px;font-weight:800;margin:12px 0 2px;">🧩 스킬별 실질 기여도 <span style="font-weight:400;color:var(--muted);font-size:11px;">(해당 스킬을 빼면 줄어드는 DPS · 버프 가치 포함)</span></div>
      ${marginalRows}
      <div style="font-size:12px;font-weight:800;margin:12px 0 4px;">🔁 상위 조합 비교</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>${altRows}</tbody></table>
      ${warnings.length ? `<div style="margin-top:10px;font-size:11px;color:#92400e;background:#fffbeb;border-radius:6px;padding:6px 8px;">⚠️ 근사/가정: ${warnings.map(escapeHtml).join(' / ')}</div>` : ''}
      <div style="margin-top:8px;font-size:10.5px;color:var(--muted);line-height:1.5;">
        모델: 쿨타임이 돈 스킬은 버프 → 고계수 순으로 자동 시전, 그 외엔 평타. 시전 1회 = 공격 주기 1회 소모. 버프(공%·최종뎀·데미지·크뎀·방관·받피증·공속)는 공식 피해 엔진에 실제 스탯으로 더해 계산하며, 소환 피해는 시전 시점 스탯으로 고정(스냅샷)합니다.
        ${relative ? '<br><b>캐릭터 공격력/명중이 비어 있어 상대 지수로 비교합니다.</b> (조합 순위에는 영향 없음)' : ''}
      </div>
    </div>`;

  $('applyBestLoadoutBtn')?.addEventListener('click', () => {
    state.equipped = [best.basic?.name, ...best.skills.map(s => s.name)].filter(Boolean);
    saveSkillLoadoutState(jobKey, state);
    renderSkillLoadoutPanel();
    setStatus('최적 스킬 조합을 현재 장착으로 저장했습니다.', 'good');
  });
}

function fillJobs() {
  const sel = $('job');
  if (!sel) return;
  const jobs = DATA.jobs?.jobs || {};
  sel.innerHTML = '<option value="">직업 선택</option>';
  Object.entries(jobs).forEach(([id]) => sel.insertAdjacentHTML('beforeend', `<option value="${id}">${JOB_NAMES[id] || id}</option>`));
  renderJobStatMapping();
  renderJobSkills();
  renderCompanionEffect();
}

function renderCombat() {
  const r = calculate();
  const power = calculatePower();
  if ($('avgDamage')) $('avgDamage').textContent = fmt(r.average);
  if ($('damageRange')) $('damageRange').textContent = `최소 ${fmt(r.min)} · 최대 ${fmt(r.max)}`;
  if ($('dps')) $('dps').textContent = fmt(r.dps);
  if ($('dpsNote')) $('dpsNote').textContent = `공속 점감 후 ${r.effectiveAttackSpeed.toFixed(2)}% · 보정 ×${r.speedFactor.toFixed(3)} · 간격 ${n('attackInterval')}초${$('targetType')?.value === 'pvp' ? ` · PvP 레벨 보정 ×${r.levelAdjustment.toFixed(4)}` : ''}`;
  if ($('combatPower')) $('combatPower').textContent = fmt(power.power);
  if ($('combatPowerNote')) $('combatPowerNote').textContent = power.provisional ? `공식식 적용 · 미입력 보조 능력치 ${power.missingInputs.length}개는 0 처리` : '공식식 적용';
  if ($('defenseFactor')) $('defenseFactor').textContent = (r.defenseFactor * 100).toFixed(2) + '%';
  if ($('defenseNote')) $('defenseNote').textContent = `관통 점감 후 ${r.effectiveDefPen.toFixed(2)}% · 방어력 ${fmt(n('targetDefense'))} → ${fmt(r.afterDef)}`;
  if ($('combatBreakdown')) {
    $('combatBreakdown').innerHTML = `<div class="breakdown-grid">
      <span>공격력<b>${fmt(r.attack)}</b></span>
      <span>치명타 기대 배율<b>×${(1 + r.critChance * n('critDamage') / 100).toFixed(3)}</b></span>
      <span>대상 보정<b>${$('targetType')?.value === 'boss' ? n('bossDamage') : n('normalDamage')}%</b></span>
    </div>`;
  }
  renderStageVerdict();
  renderStatEfficiencies();
  renderSpecUpGuide();
  saveLocal();
}

/* ==========================================================================
   Cube Exact 3-Slot Engine & Probability Simulator (Tab 4)
   ========================================================================== */

function optionSelect(value) {
  return `<select class="option-stat">${STAT_OPTIONS.map(([id, label]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

function renderOptionRows() {
  for (const id of ['currentOptions', 'candidateOptions']) {
    const el = $(id);
    if (el) {
      el.innerHTML = [0, 1, 2].map(i => `<div class="option-row">${optionSelect('NONE')}<input class="option-value" type="number" step="0.01" value="0" aria-label="${id} 옵션 ${i + 1} 값"></div>`).join('');
    }
  }
}

function valuesFor(root) {
  const out = {};
  const el = $(root);
  if (!el) return out;
  el.querySelectorAll('.option-row').forEach(row => {
    const stat = row.querySelector('.option-stat')?.value;
    const val = Number(row.querySelector('.option-value')?.value || 0);
    if (stat !== 'NONE' && val) out[stat] = (out[stat] || 0) + val;
  });
  return out;
}

const CUBE_GRADE_NAMES = { normal: '노말', rare: '레어', epic: '에픽', unique: '유니크', legendary: '레전드리', mystic: '미스틱' };

function cubeBlocks() {
  return DATA.potentialProbabilities?.grades?.[$('cubeGrade')?.value]?.blocks || [];
}

function selectedCubeBlock() {
  const equipment = $('cubeEquipment')?.value, slot = Number($('cubeSlot')?.value || 1);
  return cubeBlocks().find(block => block.equipment === equipment && block.slot === slot) || null;
}

function fillCubeGoalSelects(options) {
  const values = ['', ...options.map(item => item.option)];
  for (const [index, id] of ['cubeGoal1', 'cubeGoal2', 'cubeGoal3'].entries()) {
    const sel = $(id);
    if (!sel) continue;
    const previous = sel.value;
    sel.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${value ? escapeHtml(value) : '목표 없음'}</option>`).join('');
    if (previous && values.includes(previous)) sel.value = previous;
    else if (index === 0 && options[0]) sel.value = options[0].option;
    else sel.value = '';
  }
}

function fillCubeSources() {
  const grade = $('cubeGrade'), equipment = $('cubeEquipment'), slot = $('cubeSlot');
  if (!grade || !equipment || !slot) return;
  const grades = DATA.potentialProbabilities?.grades || {};
  const previousGrade = grade.value || 'epic';
  grade.innerHTML = Object.keys(grades).map(key => `<option value="${key}">${CUBE_GRADE_NAMES[key] || key}</option>`).join('');
  grade.value = grades[previousGrade] ? previousGrade : (Object.keys(grades)[0] || '');

  const blocks = cubeBlocks();
  const equipments = [...new Set(blocks.map(block => block.equipment))];
  const currentEquipment = equipment.value;
  equipment.innerHTML = equipments.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  if (equipments.includes(currentEquipment)) equipment.value = currentEquipment;

  const maxSlot = Math.max(1, ...blocks.filter(block => block.equipment === equipment.value).map(block => Number(block.slot) || 1));
  const currentSlot = Number(slot.value) || 1;
  slot.innerHTML = Array.from({ length: maxSlot }, (_, i) => `<option value="${i + 1}">${i + 1}번 슬롯</option>`).join('');
  slot.value = String(Math.min(currentSlot, maxSlot));

  const block = selectedCubeBlock();
  const options = block?.options || [];
  fillCubeGoalSelects(options);
  renderCubeTargetSummary();
}

function renderCubeTargetSummary() {
  const box = $('cubeTargetSummary');
  if (!box) return;
  const equipment = $('cubeEquipment')?.value;
  const blocks = cubeBlocks().filter(block => block.equipment === equipment).sort((a, b) => Number(a.slot) - Number(b.slot));
  const goals = ['cubeGoal1', 'cubeGoal2', 'cubeGoal3'].map(id => $(id)?.value).filter(Boolean);
  if (!goals.length || !blocks.length) {
    box.textContent = '목표 옵션을 선택하면 3개 슬롯 기준 기대값을 계산합니다.';
    const ecoBox = $('cubeEconomics');
    if (ecoBox) ecoBox.textContent = '목표 옵션과 1회 비용을 입력하면 달성 기대 횟수, 기대 비용 및 가성비(ROI)를 분석합니다.';
    renderCubeStopGuide();
    return;
  }
  const slotOptions = blocks.map(block => block.options || []);
  const mode = $('cubeGoalMode')?.value || 'any';
  const result = cubeTargetSummary(slotOptions, goals, mode, n('cubeCost'));
  const slots = result.slotProbabilities.map((value, index) => `${index + 1}번 ${(value * 100).toFixed(4)}%`).join(' · ');
  const modeLabel = mode === 'all' ? '선택한 목표 모두' : '선택한 목표 중 하나 이상';
  const rerollInfo = result.rerollExclusion?.rerollAdjusted
    ? `<br><small>※ 동일 옵션 3슬롯 재설정 보정: 동일 조합 확률 ${(result.rerollExclusion.sameProbability * 100).toFixed(6)}% (현재 목표 ${result.rerollExclusion.currentIsGoal ? '포함' : '미포함'})</small>`
    : '<br><small>※ 기존 옵션과 3슬롯(종류·수치·순서)이 완전히 동일하면 다른 결과가 나올 때까지 재설정 규칙 반영</small>';
  box.innerHTML = `<strong>3슬롯 목표 옵션 분석</strong><br><span>${goals.map(escapeHtml).join(' + ')}</span><br><small>${modeLabel} · 슬롯별 독립 확률: ${slots}</small>${rerollInfo}<br>1회 큐브 달성 확률 <b>${(result.probability * 100).toFixed(4)}%</b> · 기대 횟수 <b>${fmt(result.expectedAttempts)}회</b>${result.expectedCost == null ? '' : ' · 기대 메소 <b>' + fmt(result.expectedCost) + '</b>'}`;

  // MekiCalc Style Cube Bang-for-the-Buck (ROI) Economics
  const ecoBox = $('cubeEconomics');
  if (ecoBox) {
    const rate = window._lastCubeRate || 0;
    const delta = window._lastCubeDelta || 0;
    const expCost = Number(result.expectedCost) || 0;
    const roiPerMillion = expCost > 0 ? (rate / (expCost / 1000000)) : 0;

    let tierLabel = '옵션 가성비 분석';
    let tierColor = '#64748b';
    let advice = '현재 옵션과 후보 옵션의 기대비용을 비교하여 적정 단계에서 스톱하세요.';

    if (expCost > 0 && rate > 0) {
      if (roiPerMillion >= 0.05) {
        tierLabel = '👑 가성비 극상 (S-Tier)';
        tierColor = '#0b7a58';
        advice = '적은 메소로 큰 딜 상승을 얻을 수 있는 필수 가성비 옵션입니다. 최우선 강화를 권장합니다!';
      } else if (roiPerMillion >= 0.01) {
        tierLabel = '⭐ 추천 종결 라인 (A-Tier)';
        tierColor = '#4f46d9';
        advice = '실전 딜 상승과 비용의 균형이 가장 우수한 표준 종결 구간입니다.';
      } else if (roiPerMillion >= 0.002) {
        tierLabel = '⚖️ 보통 (B-Tier)';
        tierColor = '#d97706';
        advice = '비용 대비 딜 상승이 다소 낮습니다. 스타포스나 주문서 작이 덜 되었다면 다른 부위를 먼저 올리는 것이 효율적입니다.';
      } else {
        tierLabel = '⚠️ 극옵 초고자본 (C-Tier)';
        tierColor = '#b42318';
        advice = '기대 비용이 매우 높고 가성비가 낮습니다. 다른 모든 부위 15성/완작 후 마지막에 도전하세요.';
      }
    }

    ecoBox.innerHTML = `
      <div style="border:1px solid var(--line);border-radius:10px;padding:12px;background:#fbfcfe;display:grid;gap:6px;margin-top:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:14px;color:var(--ink);">💰 큐브 가성비(ROI) 분석</strong>
          <span style="font-weight:800;font-size:11px;padding:2px 8px;border-radius:6px;background:#edf2ff;color:${tierColor};">${tierLabel}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px;">
          <span>목표 달성 기대 비용:</span>
          <strong>${expCost > 0 ? fmt(expCost) + ' 메소' : '비용 미입력'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px;">
          <span>후보 옵션 딜 상승:</span>
          <strong style="color:#0b7a58;">${delta >= 0 ? '+' : ''}${fmt(delta)} DPS (${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%)</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px;border-top:1px dashed var(--line);padding-top:4px;">
          <span>💡 100만 메소당 딜 상승 효율:</span>
          <strong style="color:var(--primary-dark);">${roiPerMillion > 0 ? '+' + roiPerMillion.toFixed(4) + '% / 100만 메소' : '—'}</strong>
        </div>
        <p style="margin:4px 0 0;font-size:12px;color:var(--muted);">${advice}</p>
      </div>
    `;
  }

  renderCubeStopGuide();
}

function renderCubeStopGuide() {
  const guideList = $('cubeStopGuideList');
  if (!guideList) return;
  const equipment = $('cubeEquipment')?.value || 'weapon';
  const slot = $('cubeSlot')?.value || 'weapon';

  const isWeapon = equipment === 'weapon' || ['weapon', 'subWeapon', 'emblem'].includes(slot);
  const isGlove = slot === 'gloves';
  const isAccessory = equipment === 'accessory';

  let items = [];

  if (isWeapon) {
    items = [
      {
        title: '⚔️ 무기/보조/엠블렘: 유효 1순위 (공격력% + 보스 데미지%)',
        desc: '<strong>에픽 1줄(공6%) ➔ 유니크 2줄(공9% + 보공12%)</strong> 단계가 실전 가성비 최고점입니다.',
        badge: '가성비 최우선',
        badgeColor: '#0b7a58'
      },
      {
        title: '⚠️ 3줄 극옵(보공 3줄, 공 3줄) 주의',
        desc: '넥슨 나우 공시 확률상 3줄 극옵 확률은 0.001% 미만(기대비용 수억 메소)입니다. <strong>2줄 유효에서 멈추고 해당 메소로 스타포스(12~15성)를 올리는 것</strong>이 딜 상승 효율이 5~10배 높습니다.',
        badge: '과투자 주의',
        badgeColor: '#b42318'
      }
    ];
  } else if (isGlove) {
    items = [
      {
        title: '🧤 장갑: 크리티컬 데미지% (방어구 중 딜 상승 압도적 1위)',
        desc: '장갑 잠재능력에서 등장하는 <strong>크리티컬 데미지(유니크 4% / 레전 8%)</strong>는 캐릭터 크확 100% 기준 무기 공격력%와 맞먹는 딜 상승을 보입니다. 방어구 중 가장 먼저 큐브를 투자하세요.',
        badge: '필수 추천',
        badgeColor: '#0b7a58'
      },
      {
        title: '🎯 장갑 스톱 라인: 크뎀 1줄 + 주스탯/공격력 1줄',
        desc: '크뎀 1줄만 확보해도 충분히 종결급 가성비를 누릴 수 있습니다. 크뎀 2줄은 초고자본 영역이므로 1줄에서 멈추는 것을 강력 권장합니다.',
        badge: '가성비 종결',
        badgeColor: '#4f46d9'
      }
    ];
  } else if (isAccessory) {
    items = [
      {
        title: '💍 장신구류: 주스탯% (에픽 6% 스톱 권장)',
        desc: '반지/목걸이/귀고리는 주스탯% 위주로 옵션을 맞추며, <strong>에픽 1줄(주스탯 6%) 또는 유니크 1줄(주스탯 9%)</strong>에서 스톱하고 무기/스타포스에 자원을 집중하세요.',
        badge: '가성비 스톱',
        badgeColor: '#4f46d9'
      }
    ];
  } else {
    items = [
      {
        title: '🛡️ 일반 방어구(투구/상의/신발): 주스탯% (에픽 6% 만족 후 스톱)',
        desc: '방어구는 큐브보다 <strong>스타포스 공격력 증가 및 주문서 완작</strong>의 딜 기여도가 훨씬 높습니다. 큐브는 에픽 6% 수준에서 멈추는 것이 가장 경제적입니다.',
        badge: '절약 권장',
        badgeColor: '#d97706'
      }
    ];
  }

  guideList.innerHTML = items.map(item => `
    <div class="guide-item" style="display:grid;gap:4px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="color:var(--ink);font-size:13px;">${item.title}</strong>
        <span style="font-size:11px;font-weight:800;background:#edf2ff;color:${item.badgeColor};padding:2px 7px;border-radius:6px;">${item.badge}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);">${item.desc}</div>
    </div>
  `).join('');
}

function renderCube() {
  const current = calculate(valuesFor('currentOptions'));
  const candidate = calculate(valuesFor('candidateOptions'));
  const currentPower = calculatePower(valuesFor('currentOptions'));
  const candidatePower = calculatePower(valuesFor('candidateOptions'));
  if ($('cubeCurrentDps')) $('cubeCurrentDps').textContent = fmt(current.dps);
  if ($('cubeCandidateDps')) $('cubeCandidateDps').textContent = fmt(candidate.dps);
  const delta = candidate.dps - current.dps;
  const rate = current.dps ? delta / current.dps * 100 : 0;
  window._lastCubeDelta = delta;
  window._lastCubeRate = rate;
  if ($('cubeDelta')) $('cubeDelta').textContent = `${delta >= 0 ? '+' : ''}${fmt(delta)} (${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%)`;
  if ($('cubeCurrentPower')) $('cubeCurrentPower').textContent = fmt(currentPower.power);
  if ($('cubeCandidatePower')) $('cubeCandidatePower').textContent = fmt(candidatePower.power);
  const powerDelta = candidatePower.power - currentPower.power;
  const powerRate = currentPower.power ? powerDelta / currentPower.power * 100 : 0;
  if ($('cubePowerDelta')) $('cubePowerDelta').textContent = `${powerDelta >= 0 ? '+' : ''}${fmt(powerDelta)} (${powerRate >= 0 ? '+' : ''}${powerRate.toFixed(2)}%)`;
  renderCubeTargetSummary();
}

function renderProbability() {
  const r = probabilitySummary(n('successRate'), n('attempts'), n('attemptCost'));
  const box = $('probabilityResult');
  if (!box) return;
  if (!r.probability && r.expectedAttempts === Infinity) {
    box.innerHTML = '<div class="big-prob">0%</div>성공 확률이 0이면 달성 확률과 기대값은 계산할 수 없습니다.';
    return;
  }
  box.innerHTML = `<div class="big-prob">${(r.probability * 100).toFixed(4)}%</div>
    <ul>
      <li>${r.attempts}회 안에 1회 이상 성공할 확률: <b>${(r.probability * 100).toFixed(4)}%</b></li>
      <li>평균 기대 시도 횟수: <b>${fmt(r.expectedAttempts)}회</b></li>
      <li>평균 기대 비용: <b>${r.expectedCost == null ? '미입력' : fmt(r.expectedCost)}</b></li>
      <li>90% 달성 필요 횟수: <b>${r.need90}회</b></li>
      <li>95% 달성 필요 횟수: <b>${r.need95}회</b></li>
    </ul>`;
}

/* ==========================================================================
   High-Precision Screenshot OCR Modal
   ========================================================================== */

let pendingOcrStats = {};

function initOcrModal() {
  const modal = $('ocrModal');
  const openBtns = [$('openOcrModalBtn'), $('openOcrInFormBtn'), $('openOcrFromDrawerBtn')].filter(Boolean);
  const closeBtn = $('closeOcrModalBtn');
  const runBtn = $('runOcrModalBtn');
  const applyBtn = $('applyOcrModalBtn');
  const clipBtn = $('ocrPasteClipboardBtn');
  const fileInput = $('ocrModalFile');
  const dropZone = $('ocrModalDrop');
  const statusEl = $('ocrModalStatus');
  const resultsEl = $('ocrModalResults');
  if (!modal) return;

  openBtns.forEach(btn => btn?.addEventListener('click', () => {
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', 'true');
    dropZone?.focus();
  }));

  closeBtn?.addEventListener('click', () => {
    if (typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open');
  });

  function parseKoreanNumber(str) {
    if (!str) return null;
    let text = String(str).replace(/\s+/g, '').replace(/,/g, '').replace(/%/g, '');
    if (!text) return null;
    let total = 0, matched = false;
    if (text.includes('조')) {
      const parts = text.split('조');
      const val = parseFloat(parts[0]);
      if (Number.isFinite(val)) { total += val * 1e12; matched = true; }
      text = parts[1] || '';
    }
    if (text.includes('억')) {
      const parts = text.split('억');
      const val = parseFloat(parts[0]);
      if (Number.isFinite(val)) { total += val * 1e8; matched = true; }
      text = parts[1] || '';
    }
    if (text.includes('만')) {
      const parts = text.split('만');
      const val = parseFloat(parts[0]);
      if (Number.isFinite(val)) { total += val * 1e4; matched = true; }
      text = parts[1] || '';
    }
    if (text) {
      const val = parseFloat(text);
      if (Number.isFinite(val)) { total += val; matched = true; }
    }
    return matched ? total : null;
  }

  const STAT_LABELS = {
    attackFlat: '공격력 (+)',
    attackPct: '공격력%',
    mainStat: '주스탯 (+)',
    mainStatPct: '주스탯%',
    subStat: '부스탯 (+)',
    playerDefense: '캐릭터 방어력',
    maxHp: '최대 HP',
    maxMp: '최대 MP',
    damage: '데미지%',
    damageAmp: '데미지 증폭%',
    finalDamage: '최종 데미지%',
    bossDamage: '보스 몬스터 데미지%',
    normalDamage: '일반 몬스터 데미지%',
    critRate: '크리티컬 확률%',
    critDamage: '크리티컬 데미지%',
    defPen: '방어 관통력%',
    attackSpeed: '공격 속도%',
    minDamage: '최소 데미지 배율%',
    maxDamage: '최대 데미지 배율%',
    basicDamage: '기본 공격 데미지%',
    skillDamage: '스킬 데미지%',
    statSTR: 'STR',
    statDEX: 'DEX',
    statINT: 'INT',
    statLUK: 'LUK',
    accuracy: '명중',
    evasion: '회피',
    debuffResist: '디버프 내성',
    extraTargets: '기본 공격 대상 수 증가',
    cooldownReductionPct: '쿨타임 감소%',
    cooldownReductionSec: '쿨타임 감소(초)',
    skillLevel1: '1차 스킬 레벨',
    skillLevel2: '2차 스킬 레벨',
    skillLevel3: '3차 스킬 레벨',
    skillLevel4: '4차 스킬 레벨',
    statBased: '스탯 비례 데미지 (자동 산출)',
    totalAttack: '총 합산 공격력 (인게임 표시)',
    totalMainStat: '총 합산 주스탯 (인게임 표시)',
    mainStatPerLevel1: '1레벨당 주 스탯'
  };

  const STAT_CONFIG = [
    { target: 'bossDamage', keywords: ['보스 몬스터 데미지', '보스 몬스터데미지', '보스 몬스터', '보스데미지', '보스 데미지', '보뎀'] },
    { target: 'normalDamage', keywords: ['일반 몬스터 데미지', '일반 몬스터데미지', '일반 몬스터', '일반데미지', '일반 데미지', '일공'] },
    { target: 'damageAmp', keywords: ['데미지 증폭', '데미지증폭'] },
    { target: 'finalDamage', keywords: ['최종 데미지', '최종데미지', '최종 데미7', '치종 데미', '최종'] },
    { target: 'basicDamage', keywords: ['기본 공격 데미지', '기본공격데미지', '본 공격 데미지', '기본 공격 데미', '기본공격 데미'] },
    { target: 'skillDamage', keywords: ['스킬 데미지', '스킬데미지', 'AZ 데미지', 'AZ 데미', '스킬 데미^', '스킬 데미7', '스킬 데미'] },
    { target: 'critRate', keywords: ['크리티컬 확률', '크리티컬확률', '치명타 확률', '크확', '1리티컬 확률', '(리티컬 확률', '리티컬 확률', '티컬 확률'] },
    { target: 'critDamage', keywords: ['크리티컬 데미지', '크리티컬데미지', '치명타 데미지', '크뎀', '크리6걸데미지', '크리6걸 데미지', '크리6걸', '크리 데미지', '크리데미지', '크리6걸데미7', '크리티컬 데미7', '(리티컬 데미지', '리티컬 데미지', '리티컬데미지', '티컬 데미지', '(리티컬'] },
    { target: 'defPen', keywords: ['방어 관통력', '방어관통력', '방어력 관통', '방관'] },
    { target: 'minDamage', keywords: ['최소 데미지 배율', '최소데미지 배율', '최소 데미지', '최소 데미'] },
    { target: 'maxDamage', keywords: ['최대 데미지 배율', '최대데미지 배율', '최대 데미지', '최대 데미'] },
    { target: 'attackSpeed', keywords: ['공격 속도', '공격속도', '공속', '공격속', '공격속:'] },
    { target: 'playerDefense', keywords: ['방어력'] },
    { target: 'maxHp', keywords: ['최대 HP', '최대HP', '최대16', '최대 16', '최대1P', '최대 1P', '최대10', '최대 10', '최대1O', '최대 1O', 'ch HP', 'chHP', 'c HP', 'h HP', 'Hh HP', 'ZC HP', 'ZICH HP', 'ZIC HP', 'ICH HP', '치대 HP', '부레 치나', 'HP', 'hp', 'EEK'] },
    { target: 'maxMp', keywords: ['최대 MP', '최대MP', '최대 mp', '최대”', '최대"', '최대 M', 'At MP', 'AL MP', '최대11『', '최대11'] },
    { target: 'accuracy', keywords: ['명중', '명중률'] },
    { target: 'evasion', keywords: ['회피', '회피율'] },
    { target: 'statBased', keywords: ['스탯 비례 데미지', '스탯비례데미지', 'AEH 비례 데미지', 'HHH 데미지', 'AEH 비례', '스 비례 데미지', '스 비례', '비례 데미지', '스탯 비례', '스탯비례', 'o 비례 데미지'] },
    { target: 'damage', keywords: ['데미지'] },
    { target: 'attack', keywords: ['공격력', '승격력', '홍격력', '증격력'] },
    { target: 'statSTR', keywords: ['STR', '518', 'S1R', 'SIR'] },
    { target: 'statDEX', keywords: ['DEX', 'D EX'] },
    { target: 'statINT', keywords: ['INT', 'I NT', '1NT', '스킨 I', '스킨'] },
    { target: 'statLUK', keywords: ['LUK', 'L UK', 'ㄴ G', 'ㄴ (i)', 'ㄴ(i)', 'ㄴ i', 'ㄴ (|', 'ㄴ(', 'UK (i', 'UK'] },
    { target: 'debuffResist', keywords: ['디버프 내성', '디버프내성'] },
    { target: 'extraTargets', keywords: ['기본 공격 대상 수 증가', '기본 공격 대상 수', '기본 공격 대상', '대상 수 증가', '대상 수'] },
    { target: 'cooldownReductionPct', keywords: ['스킬 재사용 대기시간 감소', '재사용 대기시간 감소'] },
    { target: 'cooldownReductionSec', keywords: ['스킬 재사용 대기시간 감소', '재사용 대기시간 감소'] },
    { target: 'skillLevel1', keywords: ['1차 스킬 레벨', '1차 스킬레벨', '1차 스킬', '1차스킬'] },
    { target: 'skillLevel2', keywords: ['2차 스킬 레벨', '2차 스킬레벨', '2차 스킬', '2차스킬'] },
    { target: 'skillLevel3', keywords: ['3차 스킬 레벨', '3차 스킬레벨', '3차 스킬', '3차스킬'] },
    { target: 'skillLevel4', keywords: ['4차 스킬 레벨', '4차 스킬레벨', '4차 스킬', '4차스킬'] },
    { target: 'mainStatPerLevel1', keywords: ['1레벨당 주 스탯', '1레벨당 주스탯', '1HES FAH', '12ES FAH', '12ES', 'FAH', '1레벨당 FAR', '1레벨당', 'ERECEEY', 'RECEEY'] }
  ];

  function parseSingleOcrText(text) {
    if (!text) return {};
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const detected = {};
    const fullText = lines.join(' ');

    const hasPlus = fullText.includes('+') || lines.some(l => l.includes('+'));
    const hasPct = fullText.includes('%') || lines.some(l => l.includes('%'));
    const hasDetailIndicator =
      fullText.includes('합산') ||
      fullText.includes('현재 보유') ||
      fullText.includes('보유 중인') ||
      fullText.includes('스킬 효과로') ||
      fullText.includes('스킬 효과') ||
      fullText.includes('자신이 적에게') ||
      fullText.includes('피해의 기본') ||
      fullText.includes('공격력이 1') ||
      fullText.includes('증가합니다') ||
      fullText.includes('주 스탯') ||
      fullText.includes('주 ABIOR') ||
      fullText.includes('주 ABHOR') ||
      fullText.includes('주 ASO') ||
      fullText.includes('주 ANCE');

    const isDetailPopup = hasPlus && hasPct && hasDetailIndicator;

    if (isDetailPopup) {
      detected._isDetail = true;
      let detailHeader = null;
      if (
        fullText.includes('Luk 1') ||
        fullText.includes('Luk 15') ||
        fullText.includes('주 ABHOR Luk') ||
        fullText.includes('주 ABIOR Luk') ||
        fullText.includes('주 ASO Luk') ||
        fullText.includes('주 ANCE Luk') ||
        lines.slice(0, 3).some(l => l.includes('LUK') || l.includes('Luk'))
      ) {
        detailHeader = 'statLUK';
      } else if (
        fullText.includes('Str 1') ||
        fullText.includes('주 ABHOR Str') ||
        fullText.includes('주 ABIOR Str') ||
        fullText.includes('주 ASO Str') ||
        fullText.includes('주 ANCE Str') ||
        lines.slice(0, 3).some(l => l.includes('STR') || l.includes('Str'))
      ) {
        detailHeader = 'statSTR';
      } else if (
        (fullText.includes('Dex 1') ||
         fullText.includes('주 ABHOR Dex') ||
         fullText.includes('주 ABIOR Dex') ||
         fullText.includes('주 ASO Dex') ||
         fullText.includes('주 ANCE Dex') ||
         lines.slice(0, 3).some(l => l.includes('DEX') || l.includes('Dex'))) &&
        !fullText.includes('Luk 1')
      ) {
        detailHeader = 'statDEX';
      } else if (
        fullText.includes('Int 1') ||
        fullText.includes('주 ABHOR Int') ||
        fullText.includes('주 ABIOR Int') ||
        fullText.includes('주 ASO Int') ||
        fullText.includes('주 ANCE Int') ||
        lines.slice(0, 3).some(l => l.includes('INT') || l.includes('Int'))
      ) {
        detailHeader = 'statINT';
      } else if (
        fullText.includes('피해의 기본') ||
        fullText.includes('공격력 %증가') ||
        fullText.includes('각종 피해') ||
        lines.slice(0, 3).some(l => l.includes('공격력'))
      ) {
        detailHeader = 'attack';
      }

      for (const line of lines) {
        const plusMatch = line.match(/\+\s*[:;\-1]?\s*((?:[0-9,.]+\s*(?:조|억|만)\s*)*[0-9,.]+)/);
        if (plusMatch) {
          const val = parseKoreanNumber(plusMatch[1]);
          if (val !== null && val > 0) {
            if (detailHeader === 'attack') detected['attackFlat'] = val;
            else if (['statLUK', 'statSTR', 'statDEX', 'statINT'].includes(detailHeader)) {
              detected['mainStat'] = val;
            }
          }
        }
        const pctMatch = line.match(/%\s*[:;\-]?\s*([0-9,\.]+)/) || line.match(/([0-9,\.]+)\s*%/);
        if (pctMatch) {
          const val = parseKoreanNumber(pctMatch[1]);
          if (val !== null && val > 0) {
            if (detailHeader === 'attack') detected['attackPct'] = val;
            else if (['statLUK', 'statSTR', 'statDEX', 'statINT'].includes(detailHeader)) {
              detected['mainStatPct'] = val;
            }
          }
        }
        const totalMatch = line.match(/(?:합\s*산|함\s*산|합\s*상|합\s*계|총\s*합)\s*[:;\-1]?\s*((?:[0-9,.]+\s*(?:조|억|만)\s*)*[0-9,.]+)/);
        if (totalMatch) {
          const val = parseKoreanNumber(totalMatch[1]);
          if (val !== null && val > 0) {
            if (detailHeader === 'attack') {
              detected['totalAttack'] = val;
            } else if (['statLUK', 'statSTR', 'statDEX', 'statINT'].includes(detailHeader)) {
              detected[detailHeader] = val;
            }
          }
        }
      }
      return detected;
    }

    // Format B: List Table
    for (const line of lines) {
      if (line.includes('자신이 적에게') || line.includes('스킬 효과로') || line.includes('예상 능력치')) continue;
      if (line.includes('초당') || line.includes('회복') || line.includes('회보') || line.includes('재생') || line.includes('ct MP')) continue;

      for (const item of STAT_CONFIG) {
        // Protect generic 'damage' from hijacking compound damages (e.g. critDamage, statBased, etc.)
        if (item.target === 'damage') {
          if (
            line.includes('크리') ||
            line.includes('리티컬') ||
            line.includes('티컬') ||
            line.includes('치명') ||
            line.includes('스탯') ||
            line.includes('스킬') ||
            line.includes('보스') ||
            line.includes('일반') ||
            line.includes('기본') ||
            line.includes('최종') ||
            line.includes('최소') ||
            line.includes('최대') ||
            line.includes('증폭') ||
            line.includes('비례') ||
            line.includes('AEH')
          ) {
            continue;
          }
        }

        if (item.target === 'basicDamage' && (line.includes('대상') || line.includes('수 증가'))) {
          continue;
        }

        if (item.target === 'attack' && (line.includes('속도') || line.includes('대상') || line.includes('간격'))) {
          continue;
        }

        if (item.target === 'cooldownReductionPct' && (line.includes('초') || !line.includes('%'))) {
          continue;
        }
        if (item.target === 'cooldownReductionSec' && line.includes('%')) {
          continue;
        }

        const isCritDamageMatch = item.target === 'critDamage' && (
          (line.includes('크리') || line.includes('리티컬') || line.includes('티컬') || line.includes('치명') || line.includes('크뎀') || line.includes('크리6걸')) &&
          (line.includes('데미') || line.includes('뎀'))
        );

        if (isCritDamageMatch || item.keywords.some(kw => line.startsWith(kw) || line.includes(kw))) {
          let cleanLine = line;
          item.keywords.forEach(kw => { cleanLine = cleanLine.replace(kw, ''); });
          cleanLine = cleanLine.replace(/[ⓘi|()\[\]G!a_·•—~태IB]/g, ' ').trim();

          const allNums = Array.from(cleanLine.matchAll(/(?:[0-9,.]+\s*(?:조|억|만)\s*)*[0-9,.]+(?:\s*(?:조|억|만))?\s*%?/g)).map(m => m[0].trim());
          if (allNums.length > 0) {
            let bestNumStr = allNums.find(n => n.includes('%')) || allNums[allNums.length - 1];
            const val = parseKoreanNumber(bestNumStr);
            const allowZero = ['cooldownReductionPct', 'cooldownReductionSec'].includes(item.target);
            if (val !== null && (val > 0 || (allowZero && val === 0))) {
              if (item.target === 'attack') {
                detected['totalAttack'] = val;
              } else if (['statSTR', 'statDEX', 'statINT', 'statLUK'].includes(item.target)) {
                detected[item.target] = val;
              } else {
                detected[item.target] = val;
              }
            }
          }
          break;
        }
      }
    }

    return detected;
  }

  function preprocessImageFile(file) {
    return new Promise(resolve => {
      if (typeof document === 'undefined') {
        resolve({ canvas: file, isCropped: false });
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = origW;
        tempCanvas.height = origH;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        let imgData;
        try {
          imgData = tempCtx.getImageData(0, 0, origW, origH);
        } catch (e) {
          console.warn('ImageData extraction warning:', e);
          resolve({ canvas: img, isCropped: false });
          return;
        }

        const data = imgData.data;

        // Exclude top 4% (title bar) and bottom 4% (taskbar/navigation)
        const yStart = Math.floor(origH * 0.04);
        const yEnd = Math.floor(origH * 0.96);
        const centerX = Math.floor(origW * 0.50);

        const modalRows = [];
        for (let y = yStart; y < yEnd; y++) {
          let brightInCenter = 0;
          for (let x = centerX - 40; x <= centerX + 40; x++) {
            const idx = (y * origW + x) * 4;
            if (data[idx] >= 210 && data[idx + 1] >= 210 && data[idx + 2] >= 210) brightInCenter++;
          }
          if (brightInCenter >= 50) modalRows.push(y);
        }

        let isModalFound = false;
        let cropX = 0, cropY = 0, cropW = origW, cropH = origH;

        if (modalRows.length >= 20) {
          const modalMinY = modalRows[0];
          const modalMaxY = modalRows[modalRows.length - 1];

          let minX = origW, maxX = 0;
          for (const y of modalRows) {
            let leftEdge = centerX;
            let darkStreak = 0;
            for (let x = centerX; x >= 0; x--) {
              const idx = (y * origW + x) * 4;
              const isBright = data[idx] >= 210 && data[idx + 1] >= 210 && data[idx + 2] >= 210;
              if (!isBright) {
                darkStreak++;
                if (darkStreak >= 10) { leftEdge = x + 10; break; }
              } else {
                darkStreak = 0;
              }
            }

            let rightEdge = centerX;
            darkStreak = 0;
            for (let x = centerX; x < origW; x++) {
              const idx = (y * origW + x) * 4;
              const isBright = data[idx] >= 210 && data[idx + 1] >= 210 && data[idx + 2] >= 210;
              if (!isBright) {
                darkStreak++;
                if (darkStreak >= 10) { rightEdge = x - 10; break; }
              } else {
                darkStreak = 0;
              }
            }

            if (rightEdge - leftEdge >= origW * 0.15) {
              if (leftEdge < minX) minX = leftEdge;
              if (rightEdge > maxX) maxX = rightEdge;
            }
          }

          if (maxX > minX && (maxX - minX) >= origW * 0.15) {
            const pad = 8;
            cropX = Math.max(0, minX - pad);
            cropY = Math.max(0, modalMinY - pad);
            cropW = Math.min(origW - cropX, (maxX - minX) + pad * 2);
            cropH = Math.min(origH - cropY, (modalMaxY - modalMinY) + pad * 2);
            isModalFound = true;
          }
        }

        const scale = 2.5;
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = Math.round(cropW * scale);
        finalCanvas.height = Math.round(cropH * scale);
        const ctx = finalCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, finalCanvas.width, finalCanvas.height);

        let processedData = finalCanvas;
        try {
          processedData = finalCanvas.toDataURL('image/png');
        } catch (e) {}

        resolve({ canvas: processedData, isCropped: isModalFound });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ canvas: file, isCropped: false });
      };
      img.src = url;
    });
  }

  async function processFiles(files) {
    if (!files || !files.length) return;
    if (typeof window.Tesseract === 'undefined') {
      if (statusEl) statusEl.textContent = 'Tesseract OCR 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도하세요.';
      return;
    }
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/') || f instanceof Blob);
    if (!fileArray.length) {
      if (statusEl) statusEl.textContent = '이미지 파일이 선택되지 않았습니다.';
      return;
    }

    if (statusEl) statusEl.textContent = `총 ${fileArray.length}개 이미지 분석 진행 중… 잠시만 기다려주세요.`;
    pendingOcrStats = {};
    if (resultsEl) resultsEl.innerHTML = '';

    try {
      const worker = await window.Tesseract.createWorker('kor+eng');
      let processedCount = 0;
      let detailAttackParsed = false;
      let detailMainStatParsed = false;

      for (const file of fileArray) {
        processedCount++;
        if (statusEl) statusEl.textContent = `OCR 분석 중… (${processedCount}/${fileArray.length} 이미지 처리 완료)`;

        const { canvas, isCropped } = await preprocessImageFile(file);
        let text = '';
        try {
          const res = await worker.recognize(canvas);
          text = res.data.text;
        } catch (e) {
          console.warn('Preprocessed OCR error:', e);
        }

        let parsed = parseSingleOcrText(text);
        if (Object.keys(parsed).length === 0 && isCropped) {
          const resFull = await worker.recognize(file);
          parsed = parseSingleOcrText(resFull.data.text);
        }

        if (parsed._isDetail) {
          if (parsed.attackFlat !== undefined || parsed.attackPct !== undefined) detailAttackParsed = true;
          if (parsed.mainStat !== undefined || parsed.mainStatPct !== undefined) detailMainStatParsed = true;
        }

        for (const [k, v] of Object.entries(parsed)) {
          if (k.startsWith('_')) continue;
          if (k === 'attackFlat' && detailAttackParsed && !parsed._isDetail) continue;
          if (k === 'mainStat' && detailMainStatParsed && !parsed._isDetail) continue;
          pendingOcrStats[k] = v;
        }
      }
      await worker.terminate();

      if (pendingOcrStats.mainStat && !pendingOcrStats.subStat) {
        if (pendingOcrStats.statLUK && pendingOcrStats.statDEX) pendingOcrStats.subStat = pendingOcrStats.statDEX;
        else if (pendingOcrStats.statSTR && pendingOcrStats.statDEX) pendingOcrStats.subStat = pendingOcrStats.statDEX;
        else if (pendingOcrStats.statDEX && pendingOcrStats.statSTR) pendingOcrStats.subStat = pendingOcrStats.statSTR;
        else if (pendingOcrStats.statINT && pendingOcrStats.statLUK) pendingOcrStats.subStat = pendingOcrStats.statLUK;
      }

      const displayStats = Object.entries(pendingOcrStats).filter(([k]) => !k.startsWith('_'));
      const foundCount = displayStats.length;
      if (foundCount === 0) {
        if (statusEl) statusEl.textContent = `총 ${fileArray.length}개 이미지에서 스탯 수치를 감지하지 못했습니다. 글자가 선명한 스탯 팝업 스크린샷을 사용하세요.`;
      } else {
        if (statusEl) statusEl.textContent = `총 ${fileArray.length}개 이미지 분석 완료! ${foundCount}개 스탯 항목을 수집했습니다. 확인 후 적용을 누르세요.`;
        if (resultsEl) {
          const guideHtml = `
            <div style="grid-column: 1 / -1; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; padding: 10px 14px; font-size: 12px; color: var(--ink); line-height: 1.6; margin-bottom: 6px;">
              💡 <strong>스탯 추출 안내</strong><br>
              • 메인 스탯 창의 수치는 <strong>총 합산치</strong>이므로, 이 스크린샷에서는 절대 수치인 <strong>공격력(+)</strong>과 <strong>주스탯(+)</strong>을 알 수 없어 자동 제외됩니다.<br>
              • <strong>공격력(+)</strong>과 <strong>주스탯(+)</strong> 및 %를 등록하시려면, 인게임에서 공격력/주스탯을 터치했을 때 나오는 <strong>'상세 팝업 스크린샷'</strong>을 함께 등록해 주세요.<br>
              • 스탯 창은 스크롤 방식이므로, <strong>스크롤을 아래로 내린 하단 스크린샷</strong>을 함께 올리시면 보공, 방관, 최종뎀 등도 일괄 등록됩니다.
            </div>
          `;
          resultsEl.innerHTML = guideHtml + displayStats.map(([field, val]) => {
            const label = STAT_LABELS[field] || field;
            return `<div class="stat-row" style="border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:#fff;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:12px;font-weight:700;color:var(--ink);">${label}</span>
              <input data-ocr-field="${field}" type="number" step="0.01" value="${val}" style="width:110px;padding:4px 8px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:800;">
            </div>`;
          }).join('');
        }
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'OCR 분석 중 오류가 발생했습니다: ' + err.message;
    }
  }

  function extractImageFiles(e) {
    const clipboardData = e.clipboardData || window.clipboardData || e.originalEvent?.clipboardData;
    const list = [];
    if (clipboardData) {
      if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          if (clipboardData.files[i].type.startsWith('image/')) list.push(clipboardData.files[i]);
        }
      }
      if (list.length === 0 && clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item.type?.indexOf('image') === 0 || item.kind === 'file') {
            const blob = item.getAsFile();
            if (blob) list.push(blob);
          }
        }
      }
    }
    return list;
  }

  function handlePaste(e) {
    const files = extractImageFiles(e);
    if (files.length > 0) {
      e.preventDefault();
      if (typeof modal.showModal === 'function' && !modal.open) modal.showModal();
      else modal.setAttribute('open', 'true');
      processFiles(files);
    }
  }

  window.addEventListener('paste', handlePaste);
  document.addEventListener('paste', handlePaste);
  modal.addEventListener('paste', handlePaste);
  dropZone?.addEventListener('paste', handlePaste);

  [dropZone, modal].filter(Boolean).forEach(el => {
    el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
      if (files.length > 0) processFiles(files);
    });
  });

  clipBtn?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        const files = [];
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              files.push(new File([blob], 'clipboard-image.png', { type }));
            }
          }
        }
        if (files.length > 0) {
          processFiles(files);
          return;
        }
      }
    } catch (err) {
      console.warn('Async Clipboard API read failed:', err);
    }
    if (statusEl) statusEl.textContent = '클립보드 이미지를 읽는 중입니다. Ctrl+V 키를 누르시면 즉시 분석됩니다.';
  });

  runBtn?.addEventListener('click', () => processFiles(fileInput?.files));
  fileInput?.addEventListener('change', e => processFiles(e.target.files));
  applyBtn?.addEventListener('click', () => {
    resultsEl?.querySelectorAll('[data-ocr-field]').forEach(input => {
      const field = input.dataset.ocrField;
      const val = Number(input.value);
      if ($(field) && Number.isFinite(val)) $(field).value = val;
    });
    renderCompanionEffect();
    renderCombat();
    if (typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open');
    setStatus('OCR 스탯 수치가 캐릭터 폼에 적용되었습니다.', 'good');
  });
}

/* ==========================================================================
   Tool Drawers PostMessage Listener
   ========================================================================== */

function applyDetailedStats(stats) {
  let count = 0;
  for (const [key, id] of Object.entries(MEKICALC_STAT_MAP)) {
    if (stats?.[key] !== undefined && $(id)) {
      $(id).value = stats[key];
      count++;
    }
  }
  if (count) {
    saveLocal();
    queueCloudSave();
    renderCompanionEffect();
    renderCombat();
    updateCompanionResult();
    optimizeContent();
    setStatus(`상세 스탯 ${count}개를 계산기에 반영했습니다.`, 'good');
  }
  return count;
}

window.addEventListener('storage', event => {
  if (event.key === 'maple-growth-lab-companion-inventory') loadOcrCompanions();
  if (event.key === 'maple-growth-lab-detailed-stats') {
    try {
      const saved = JSON.parse(localStorage.getItem('maple-growth-lab-detailed-stats') || '{}');
      applyDetailedStats(saved.stats || {});
    } catch {}
  }
  if ([STORE, 'maple-growth-lab-companion-inventory', 'maple-growth-lab-detailed-stats', BUILD_PRESET_KEY, 'maple-growth-lab-preset-ocr-v01'].includes(event.key)) {
    queueCloudSave();
  }
});

window.addEventListener('message', event => {
  if (event.data?.type === 'maple-growth-lab-stats') {
    applyDetailedStats(event.data.stats || {});
    activateTab('combat');
    const target = $('characterForm');
    if (target) {
      target.classList.remove('focus-flash');
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('focus-flash');
        setTimeout(() => target.classList.remove('focus-flash'), 1500);
      }, 0);
    }
  }
});

/* ==========================================================================
   Spec-Up Optimizer & MekiCalc Enhancements (자원 기반 스펙업 최적화)
   ========================================================================== */

const SPECUP_STORE_KEY = 'maple-growth-lab-specup-equips-v01';

const DEFAULT_SPECUP_EQUIPMENT_PRESETS = {
  120: [
    { id: 'weapon', name: '앱솔랩스 무기', slotType: 'weapon', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 8, scrollSlotsUsed: 4, cubeGrade: 'unique', cubeValidLines: 1 },
    { id: 'hat', name: '앱솔랩스 모자', slotType: 'armor', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 7, scrollSlotsUsed: 4, cubeGrade: 'epic', cubeValidLines: 1 },
    { id: 'top_bottom', name: '앱솔랩스 한벌옷', slotType: 'armor', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 7, scrollSlotsUsed: 4, cubeGrade: 'epic', cubeValidLines: 1 },
    { id: 'glove', name: '앱솔랩스 장갑', slotType: 'glove', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 7, scrollSlotsUsed: 4, cubeGrade: 'epic', cubeValidLines: 0 },
    { id: 'shoes', name: '앱솔랩스 신발', slotType: 'armor', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 7, scrollSlotsUsed: 4, cubeGrade: 'epic', cubeValidLines: 1 },
    { id: 'cape', name: '앱솔랩스 망토', slotType: 'armor', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 7, scrollSlotsUsed: 4, cubeGrade: 'rare', cubeValidLines: 0 },
    { id: 'accessory1', name: '마이스터링', slotType: 'accessory', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 4, scrollSlotsUsed: 2, cubeGrade: 'epic', cubeValidLines: 1 },
    { id: 'accessory2', name: '도미네이터 펜던트', slotType: 'accessory', itemLevel: 120, currentStar: 10, maxStar: 15, scrollSlotsTotal: 4, scrollSlotsUsed: 2, cubeGrade: 'epic', cubeValidLines: 1 }
  ],
  100: [
    { id: 'weapon', name: '파프니르 무기', slotType: 'weapon', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 7, scrollSlotsUsed: 3, cubeGrade: 'epic', cubeValidLines: 1 },
    { id: 'hat', name: '파프니르 모자', slotType: 'armor', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 6, scrollSlotsUsed: 3, cubeGrade: 'rare', cubeValidLines: 0 },
    { id: 'top_bottom', name: '파프니르 상/하의', slotType: 'armor', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 6, scrollSlotsUsed: 3, cubeGrade: 'rare', cubeValidLines: 0 },
    { id: 'glove', name: '여제 장갑', slotType: 'glove', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 6, scrollSlotsUsed: 3, cubeGrade: 'rare', cubeValidLines: 0 },
    { id: 'shoes', name: '여제 신발', slotType: 'armor', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 6, scrollSlotsUsed: 3, cubeGrade: 'rare', cubeValidLines: 0 },
    { id: 'cape', name: '여제 망토', slotType: 'armor', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 6, scrollSlotsUsed: 3, cubeGrade: 'rare', cubeValidLines: 0 },
    { id: 'accessory1', name: '골든 클로버 벨트', slotType: 'accessory', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 3, scrollSlotsUsed: 1, cubeGrade: 'rare', cubeValidLines: 0 },
    { id: 'accessory2', name: '아쿠아틱 레터 눈장식', slotType: 'accessory', itemLevel: 100, currentStar: 8, maxStar: 12, scrollSlotsTotal: 3, scrollSlotsUsed: 1, cubeGrade: 'rare', cubeValidLines: 0 }
  ],
  140: [
    { id: 'weapon', name: '아케인셰이드 무기', slotType: 'weapon', itemLevel: 140, currentStar: 15, maxStar: 20, scrollSlotsTotal: 9, scrollSlotsUsed: 6, cubeGrade: 'legendary', cubeValidLines: 2 },
    { id: 'hat', name: '아케인셰이드 모자', slotType: 'armor', itemLevel: 140, currentStar: 12, maxStar: 20, scrollSlotsTotal: 8, scrollSlotsUsed: 5, cubeGrade: 'unique', cubeValidLines: 1 },
    { id: 'top_bottom', name: '아케인셰이드 한벌옷', slotType: 'armor', itemLevel: 140, currentStar: 12, maxStar: 20, scrollSlotsTotal: 8, scrollSlotsUsed: 5, cubeGrade: 'unique', cubeValidLines: 1 },
    { id: 'glove', name: '아케인셰이드 장갑', slotType: 'glove', itemLevel: 140, currentStar: 15, maxStar: 20, scrollSlotsTotal: 8, scrollSlotsUsed: 6, cubeGrade: 'unique', cubeValidLines: 2 },
    { id: 'shoes', name: '아케인셰이드 신발', slotType: 'armor', itemLevel: 140, currentStar: 12, maxStar: 20, scrollSlotsTotal: 8, scrollSlotsUsed: 5, cubeGrade: 'unique', cubeValidLines: 1 },
    { id: 'cape', name: '아케인셰이드 망토', slotType: 'armor', itemLevel: 140, currentStar: 12, maxStar: 20, scrollSlotsTotal: 8, scrollSlotsUsed: 5, cubeGrade: 'unique', cubeValidLines: 1 },
    { id: 'accessory1', name: '거대한 공포', slotType: 'accessory', itemLevel: 140, currentStar: 12, maxStar: 20, scrollSlotsTotal: 5, scrollSlotsUsed: 3, cubeGrade: 'unique', cubeValidLines: 1 },
    { id: 'accessory2', name: '커맨더 포스 이어링', slotType: 'accessory', itemLevel: 140, currentStar: 12, maxStar: 20, scrollSlotsTotal: 5, scrollSlotsUsed: 3, cubeGrade: 'unique', cubeValidLines: 1 }
  ]
};

let specupEquipments = parseLocalJson(SPECUP_STORE_KEY, DEFAULT_SPECUP_EQUIPMENT_PRESETS[120]);

function formatStatGainsSummary(statGains) {
  if (!statGains || typeof statGains !== 'object') return '—';
  const parts = [];
  if (statGains.attackFlat) parts.push(`공격력 +${fmt(statGains.attackFlat)}`);
  if (statGains.attackPct) parts.push(`공격력 +${fmt(statGains.attackPct)}%`);
  if (statGains.mainStat) parts.push(`주스탯 +${fmt(statGains.mainStat)}`);
  if (statGains.mainStatPct) parts.push(`주스탯 +${fmt(statGains.mainStatPct)}%`);
  if (statGains.subStat) parts.push(`부스탯 +${fmt(statGains.subStat)}`);
  if (statGains.critDamage) parts.push(`크뎀 +${fmt(statGains.critDamage)}%`);
  if (statGains.critRate) parts.push(`크확 +${fmt(statGains.critRate)}%`);
  if (statGains.bossDamage) parts.push(`보공 +${fmt(statGains.bossDamage)}%`);
  if (statGains.damage) parts.push(`데미지 +${fmt(statGains.damage)}%`);
  if (statGains.finalDamage) parts.push(`최종뎀 +${fmt(statGains.finalDamage)}%`);
  if (statGains.defPen) parts.push(`방관 +${fmt(statGains.defPen)}%`);
  if (statGains.maxHp) parts.push(`HP +${fmt(statGains.maxHp)}`);
  return parts.length ? parts.join(', ') : '기본 스탯 상승';
}

function renderSpecupEquipTable() {
  const tbody = $('specupEquipTableBody');
  if (!tbody) return;
  tbody.innerHTML = specupEquipments.map(eq => `
    <tr style="border-bottom:1px solid var(--line);">
      <td style="padding:6px 4px;font-weight:700;">
        <input type="text" data-eq-id="${escapeHtml(eq.id)}" data-field="name" value="${escapeHtml(eq.name)}" style="width:105px;font-size:12px;padding:4px 6px;">
      </td>
      <td style="padding:6px 4px;">
        <select data-eq-id="${escapeHtml(eq.id)}" data-field="itemLevel" style="font-size:12px;padding:4px;">
          <option value="100" ${eq.itemLevel === 100 ? 'selected' : ''}>100제</option>
          <option value="120" ${eq.itemLevel === 120 ? 'selected' : ''}>120제</option>
          <option value="140" ${eq.itemLevel === 140 ? 'selected' : ''}>140제</option>
          <option value="160" ${eq.itemLevel === 160 ? 'selected' : ''}>160제</option>
        </select>
      </td>
      <td style="padding:6px 4px;">
        <div style="display:flex;align-items:center;gap:3px;">
          <input type="number" min="0" max="30" data-eq-id="${escapeHtml(eq.id)}" data-field="currentStar" value="${eq.currentStar}" style="width:46px;font-size:12px;padding:4px;">
          <span>/</span>
          <input type="number" min="5" max="30" data-eq-id="${escapeHtml(eq.id)}" data-field="maxStar" value="${eq.maxStar}" style="width:46px;font-size:12px;padding:4px;">
        </div>
      </td>
      <td style="padding:6px 4px;">
        <div style="display:flex;align-items:center;gap:3px;">
          <input type="number" min="0" max="15" data-eq-id="${escapeHtml(eq.id)}" data-field="scrollSlotsUsed" value="${eq.scrollSlotsUsed}" style="width:44px;font-size:12px;padding:4px;">
          <span>/</span>
          <input type="number" min="1" max="15" data-eq-id="${escapeHtml(eq.id)}" data-field="scrollSlotsTotal" value="${eq.scrollSlotsTotal}" style="width:44px;font-size:12px;padding:4px;">
        </div>
      </td>
      <td style="padding:6px 4px;">
        <select data-eq-id="${escapeHtml(eq.id)}" data-field="cubeGrade" style="font-size:12px;padding:4px;">
          <option value="rare" ${eq.cubeGrade === 'rare' ? 'selected' : ''}>레어</option>
          <option value="epic" ${eq.cubeGrade === 'epic' ? 'selected' : ''}>에픽</option>
          <option value="unique" ${eq.cubeGrade === 'unique' ? 'selected' : ''}>유니크</option>
          <option value="legendary" ${eq.cubeGrade === 'legendary' ? 'selected' : ''}>레전더리</option>
        </select>
      </td>
      <td style="padding:6px 4px;">
        <select data-eq-id="${escapeHtml(eq.id)}" data-field="cubeValidLines" style="font-size:12px;padding:4px;width:125px;">
          <option value="0" ${(eq.cubeValidLines ?? 1) === 0 ? 'selected' : ''}>0줄 (잡옵 3줄)</option>
          <option value="1" ${(eq.cubeValidLines ?? 1) === 1 ? 'selected' : ''}>1줄 유효 (기본작)</option>
          <option value="2" ${(eq.cubeValidLines ?? 1) === 2 ? 'selected' : ''}>2줄 유효 (준종결)</option>
          <option value="3" ${(eq.cubeValidLines ?? 1) === 3 ? 'selected' : ''}>3줄 극옵 (완결)</option>
        </select>
      </td>
    </tr>
  `).join('');

  // Bind input changes to update specupEquipments state & persist
  tbody.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', () => {
      const eqId = el.dataset.eqId;
      const field = el.dataset.field;
      const targetEq = specupEquipments.find(e => e.id === eqId);
      if (targetEq) {
        if (['itemLevel', 'currentStar', 'maxStar', 'scrollSlotsUsed', 'scrollSlotsTotal', 'cubeValidLines'].includes(field)) {
          targetEq[field] = Number(el.value) || 0;
        } else {
          targetEq[field] = el.value;
        }
        localStorage.setItem(SPECUP_STORE_KEY, JSON.stringify(specupEquipments));
      }
    });
  });
}

function applySpecupPreset(level) {
  const preset = DEFAULT_SPECUP_EQUIPMENT_PRESETS[level];
  if (preset) {
    specupEquipments = JSON.parse(JSON.stringify(preset));
    localStorage.setItem(SPECUP_STORE_KEY, JSON.stringify(specupEquipments));
    renderSpecupEquipTable();
    setStatus(`${level}제 장비 프리셋이 적용되었습니다.`, 'good');
  }
}

function handleRunSfStandalone() {
  const slotType = $('sfStandaloneSlot')?.value || 'weapon';
  const itemLevel = Number($('sfStandaloneLevel')?.value || 120);
  const startStar = Number($('sfStandaloneStart')?.value || 0);
  const targetStar = Number($('sfStandaloneTarget')?.value || 10);
  const resEl = $('sfStandaloneResult');
  if (!resEl) return;

  if (targetStar <= startStar) {
    resEl.innerHTML = `<span style="color:var(--amber);">⚠️ 목표 성급(${targetStar}성)은 시작 성급(${startStar}성)보다 커야 합니다.</span>`;
    return;
  }

  const res = calculateStarforcePath(startStar, targetStar, {
    itemLevel,
    slotType,
    probabilities: DATA.probabilities,
    rules: DATA.enhancementRules?.starforce
  });

  resEl.innerHTML = `
    <div style="background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:6px;display:grid;gap:6px;">
      <div style="font-weight:800;color:var(--ink);">${startStar}성 ➔ ${targetStar}성 강화 기대치 (${itemLevel}제 ${slotType})</div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:4px;">
        <span>기대 소모 메소</span>
        <strong style="color:var(--primary-dark);">${fmt(res.totalCost)} 메소</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:4px;">
        <span>기대 시도 횟수</span>
        <strong>${fmt(res.totalAttempts)} 회</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:4px;">
        <span>기대 파괴(초기화) 횟수</span>
        <strong style="color:var(--red);">${fmt(res.totalDestroys)} 회</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:4px;">
        <span>기대 단계 하락 횟수</span>
        <strong style="color:var(--amber);">${fmt(res.totalDowngrades)} 회</strong>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
        누적 스탯 상승: ${formatStatGainsSummary(res.statGains)}
      </div>
    </div>
  `;
}

function handleRunScrollStandalone() {
  const slotType = $('scrollStandaloneSlot')?.value || 'weapon';
  const scrollKey = $('scrollStandaloneType')?.value || 'scroll70';
  const targetSuccess = Number($('scrollStandaloneSuccess')?.value || 8);
  const resEl = $('scrollStandaloneResult');
  if (!resEl) return;

  const res = calculateScrollEnhancement(0, targetSuccess, scrollKey, {
    slotType,
    rules: DATA.enhancementRules
  });

  resEl.innerHTML = `
    <div style="background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:6px;display:grid;gap:6px;">
      <div style="font-weight:800;color:var(--ink);">${res.scrollName} ${targetSuccess}슬롯 완작 기대치 (${slotType})</div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:4px;">
        <span>기대 주문서 소모량</span>
        <strong style="color:var(--primary-dark);">${fmt(res.expectedScrolls)} 장</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:4px;">
        <span>실패 복구용 순백 주문서(10%)</span>
        <strong style="color:var(--amber);">${fmt(res.expectedCleanSlates)} 장</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:4px;">
        <span>기대 재화 소모액</span>
        <strong>${fmt(res.totalCost)} 메소</strong>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
        완작 스탯 상승: ${formatStatGainsSummary(res.statGains)}
      </div>
    </div>
  `;
}

function handleRunSpecupOptimizer() {
  const budgetMeso = Number($('specupBudgetMeso')?.value || 50000000);
  const maxSteps = Number($('specupMaxSteps')?.value || 20);
  const playerInputs = readInputs();

  // Run dynamic portfolio optimization
  const res = optimizeSpecUpPath({
    budgetMeso,
    playerInputs,
    equipmentList: specupEquipments,
    enhancementRules: DATA.enhancementRules,
    starforceProbabilities: DATA.probabilities,
    potentialProbabilities: DATA.potentialProbabilities,
    combatRules: DATA.combat,
    maxSteps
  });

  if ($('specupDpsSummary')) $('specupDpsSummary').textContent = `${fmt(res.initialDps)} ➔ ${fmt(res.finalDps)}`;
  if ($('specupDpsGainPct')) $('specupDpsGainPct').textContent = `+${res.totalDpsGainPct.toFixed(2)}% 증가`;
  if ($('specupPowerSummary')) $('specupPowerSummary').textContent = `${fmt(res.initialPower)} ➔ ${fmt(res.finalPower)}`;
  if ($('specupPowerGainPct')) $('specupPowerGainPct').textContent = `+${res.totalPowerGainPct.toFixed(2)}% 증가`;
  if ($('specupBudgetSummary')) $('specupBudgetSummary').textContent = `${fmt(res.budgetUsed)} 메소`;
  if ($('specupBudgetLeft')) $('specupBudgetLeft').textContent = `남은 예산: ${fmt(res.budgetRemaining)} 메소`;
  if ($('specupStepsCount')) $('specupStepsCount').textContent = `${res.steps.length} 단계`;

  const listEl = $('specupRoadmapList');
  if (!listEl) return;

  if (!res.steps || res.steps.length === 0) {
    listEl.innerHTML = `
      <div class="stage-verdict warn" style="margin:0;">
        ⚠️ 현재 보유 예산(${fmt(budgetMeso)} 메소) 내에서 진행 가능한 강화 후보가 없습니다. 예산을 늘리거나 다른 장비 부위를 설정해보세요.
      </div>
    `;
    return;
  }

  const typeLabels = {
    starforce: '⭐ 스타포스',
    scroll: '📜 주문서',
    cube: '🧊 잠재능력'
  };

  listEl.innerHTML = res.steps.map(s => `
    <div class="roadmap-card">
      <div class="roadmap-head">
        <span class="roadmap-rank">#${s.stepNumber}</span>
        <span class="type-badge ${s.type}">${typeLabels[s.type] || s.type}</span>
        <span class="roadmap-title">${escapeHtml(s.description)}</span>
        <span class="roadmap-cost">${fmt(s.cost)} 메소</span>
      </div>
      <div class="roadmap-metrics">
        <span class="roadmap-gain">DPS +${s.dpsGainPct.toFixed(2)}% (+${fmt(s.dpsDelta)})</span>
        <span class="roi-badge">💡 1만 메소당 +${s.roi.toFixed(4)}%</span>
        <span class="roadmap-stats">획득: ${formatStatGainsSummary(s.statGains)}</span>
        <span>잔여: ${fmt(s.budgetRemaining)} 메소</span>
      </div>
    </div>
  `).join('');
}

function initSpecupTab() {
  renderSpecupEquipTable();
  $('specupPreset120Btn')?.addEventListener('click', () => applySpecupPreset(120));
  $('specupPreset100Btn')?.addEventListener('click', () => applySpecupPreset(100));
  $('specupPreset140Btn')?.addEventListener('click', () => applySpecupPreset(140));
  $('runSpecupOptimizerBtn')?.addEventListener('click', handleRunSpecupOptimizer);
  $('runSfStandaloneBtn')?.addEventListener('click', handleRunSfStandalone);
  $('runScrollStandaloneBtn')?.addEventListener('click', handleRunScrollStandalone);
}

/* ==========================================================================
   Tab Navigation & Rendering
   ========================================================================== */

function activateTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    const isActive = p.dataset.panel === tabName;
    p.classList.toggle('active', isActive);
  });
  if (tabName === 'content') {
    renderContentGuide();
    optimizeContent();
  } else if (tabName === 'specup') {
    renderSpecupEquipTable();
  }
}

function renderAll() {
  renderJobStatMapping();
  renderJobSkills();
  renderCombat();
  renderCube();
  renderProbability();
  fillCubeSources();
  renderSpecupEquipTable();
}

async function loadData() {
  try {
    const [combat, stats, jobs, probabilities, potentialProbabilities, companionRuntime, companionRules, stageData, bossData, growthDungeonData, guildData, dropTableData, jobSkills, patchNotes, enhancementRules] = await Promise.all([
      fetch('data/combat-rules.json').then(r => r.json()),
      fetch('data/stat-rules.json').then(r => r.json()),
      fetch('data/job-stats.json').then(r => r.json()),
      fetch('data/probabilities.json').then(r => r.json()),
      fetch('data/potential-probabilities.json').then(r => r.json()),
      fetch('data/companion-runtime-data.json').then(r => r.json()),
      fetch('data/companion-rules.json').then(r => r.json()),
      fetch('data/stage-data.json').then(r => r.json()),
      fetch('data/boss-data.json').then(r => r.json()),
      fetch('data/growth-dungeon-data.json').then(r => r.json()),
      fetch('data/guild-data.json').then(r => r.json()),
      fetch('data/drop-table-data.json').then(r => r.json()),
      fetch('data/job-skills.json').then(r => r.json()),
      fetch('data/official-patch-notes.json').then(r => r.json()),
      fetch('data/enhancement-rules.json').then(r => r.json())
    ]);
    Object.assign(DATA, {
      combat, stats, jobs, probabilities, potentialProbabilities, companionRuntime, companionRules, stageData, bossData, growthDungeonData, guildData, dropTableData, jobSkills, patchNotes, enhancementRules
    });
    companionDatabase = companionRuntime;
    fillJobs();
    renderJobSkills();
    fillStageChapters();
    loadLocal();
    fillStageChapters();
    renderCompanionSlots();
    renderCompanionEffect();
    renderInventoryRoster();
    loadOcrCompanions();
    loadCommunityGuide();
    renderCompanionGuide();
    applyCompanionScenario();
    updateCompanionResult();
    renderBuildPresets();
    renderStageInfo();
    renderContentGuide();
    optimizeContent();
    initSpecupTab();
    if ($('probabilitySource')) {
      $('probabilitySource').textContent = `공식 설정 확률 데이터 로드 완료 · ${probabilities?.source?.verificationStatus || '검증 상태 확인 필요'}`;
    }
    if ($('stageDataStatus')) {
      $('stageDataStatus').textContent = `스테이지 데이터 로드 완료 · 사냥 ${stageData.hunt?.length || 0}개 · 도전 ${stageData.trial?.length || 0}개 · 보스/던전/길드 연동`;
    }
    setStatus('공식 전투·능력치·동료·확률·강화 데이터 로드 완료 · 클라우드 준비 완료', 'good');
    renderAll();
  } catch (e) {
    setStatus('데이터 파일을 불러오지 못했습니다: ' + e.message, 'bad');
    renderAll();
  }
}

/* ==========================================================================
   UI Event Bindings
   ========================================================================== */

function bind() {
  initOcrModal();
  initCloud();

  // Cloud buttons
  $('cloudOpenBtn')?.addEventListener('click', openCloudModal);
  $('cloudCloseBtn')?.addEventListener('click', closeCloudModal);
  $('cloudLoginModal')?.addEventListener('click', e => { if (e.target.id === 'cloudLoginModal') closeCloudModal(); });
  $('cloudLoginBtn')?.addEventListener('click', cloudLogin);
  $('cloudGoogleBtn')?.addEventListener('click', cloudGoogleLogin);
  $('cloudLogoutBtn')?.addEventListener('click', cloudLogout);
  $('cloudSaveBtn')?.addEventListener('click', () => cloudSave(false));
  $('cloudLoadBtn')?.addEventListener('click', cloudLoad);

  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // Character & Target input change events
  ['input', 'change'].forEach(evt => {
    document.querySelectorAll('#characterForm input,#characterForm select,#targetForm input,#targetForm select').forEach(el => {
      el.addEventListener(evt, () => {
        renderCompanionEffect();
        if (el.id === 'job') {
          renderJobStatMapping();
          renderJobSkills();
        } else if (el.id === 'level' && evt === 'change') {
          renderSkillLoadoutPanel();
        }
        if (['stageMode', 'stageChapter'].includes(el.id)) {
          if (el.id === 'stageMode') fillStageChapters(); else fillStages();
        } else if (el.id === 'stageSelect') {
          applyStageTarget();
          renderStageInfo();
        }
        renderCombat();
      });
    });
  });

  $('calculateCombat')?.addEventListener('click', renderCombat);
  $('calculateCube')?.addEventListener('click', renderCube);
  $('cubeGrade')?.addEventListener('change', fillCubeSources);
  $('cubeEquipment')?.addEventListener('change', fillCubeSources);
  $('cubeSlot')?.addEventListener('change', fillCubeSources);
  $('cubeGoalMode')?.addEventListener('change', renderCubeTargetSummary);
  ['cubeGoal1', 'cubeGoal2', 'cubeGoal3'].forEach(id => $(id)?.addEventListener('change', renderCubeTargetSummary));
  $('calculateProbability')?.addEventListener('click', renderProbability);
  document.querySelectorAll('#currentOptions,#candidateOptions').forEach(el => el.addEventListener('input', renderCube));

  // Quick Action Buttons
  $('saveQuick')?.addEventListener('click', () => {
    saveLocal();
    queueCloudSave();
    if ($('activePresetLabel')) $('activePresetLabel').textContent = '현재 입력 저장됨';
  });
  $('resetAll')?.addEventListener('click', () => {
    if (confirm('현재 입력을 초기화할까요?')) {
      localStorage.removeItem(STORE);
      location.reload();
    }
  });

  // Local Preset Profiles
  $('savePreset')?.addEventListener('click', () => {
    const name = $('presetName')?.value.trim();
    if (!name) { alert('프리셋 이름을 입력하세요.'); return; }
    const p = profiles();
    p[name] = snapshot();
    saveProfiles(p);
    if ($('presetSelect')) $('presetSelect').value = name;
    if ($('activePresetLabel')) $('activePresetLabel').textContent = name;
    saveLocal();
  });
  $('loadPreset')?.addEventListener('click', () => {
    const name = $('presetSelect')?.value, p = profiles();
    if (name && p[name]) {
      if ($('activePresetLabel')) $('activePresetLabel').textContent = name;
      applySnapshot(p[name]);
      saveLocal();
    }
  });
  $('deletePreset')?.addEventListener('click', () => {
    const name = $('presetSelect')?.value;
    if (!name) return;
    const p = profiles();
    delete p[name];
    saveProfiles(p);
    if ($('activePresetLabel')) $('activePresetLabel').textContent = '현재 입력';
  });

  // Presets JSON Import / Export
  $('exportPresetBtn')?.addEventListener('click', downloadPresetDocument);
  $('importPresetBtn')?.addEventListener('click', () => $('presetFileInput')?.click());
  $('presetFileInput')?.addEventListener('change', e => {
    if (e.target.files?.[0]) importPresetFile(e.target.files[0]);
  });

  // Build Presets
  $('saveBuildPresetBtn')?.addEventListener('click', saveBuildPreset);
  $('updateBuildPresetBtn')?.addEventListener('click', updateBuildPreset);
  $('loadBuildPresetBtn')?.addEventListener('click', loadBuildPreset);
  $('deleteBuildPresetBtn')?.addEventListener('click', deleteBuildPreset);

  // Companion Management Buttons
  $('loadOcrCompanionsBtn')?.addEventListener('click', loadOcrCompanions);
  $('clearInventoryBtn')?.addEventListener('click', () => {
    ownedCompanions = [];
    localStorage.removeItem('maple-growth-lab-companion-inventory');
    renderOwnedCompanions();
    if ($('companionInventoryStatus')) $('companionInventoryStatus').textContent = '보유 레벨을 모두 비웠습니다. 필요한 동료 행에 레벨을 입력하세요.';
  });
  $('recommendFromInventoryBtn')?.addEventListener('click', recommendFromInventory);
  $('companionOptimizeBtn')?.addEventListener('click', () => {
    saveLocal();
    optimizeCompanions();
  });
  $('companionResetBtn')?.addEventListener('click', () => {
    savedCompanionSlots = [];
    renderCompanionSlots();
    updateCompanionResult();
    saveLocal();
  });
  $('compScenario')?.addEventListener('change', applyCompanionScenario);
  $('compGoal')?.addEventListener('change', () => {
    renderCompanionGuide();
    updateCompanionResult();
  });
  $('compChapterFocus')?.addEventListener('change', updateCompanionResult);
  $('compPreset')?.addEventListener('change', renderCommunityPreset);
  $('applyCommunityPresetBtn')?.addEventListener('click', applyCommunityPreset);

  // Content & Stage Controls
  $('contentType')?.addEventListener('change', () => {
    renderContentGuide();
    optimizeContent();
  });
  $('contentTarget')?.addEventListener('input', optimizeContent);
  $('stageMode')?.addEventListener('change', () => {
    fillStageChapters();
    optimizeContent();
  });
  $('stageChapter')?.addEventListener('change', () => {
    fillStages();
    optimizeContent();
  });
  $('stageSelect')?.addEventListener('change', () => {
    renderStageInfo();
    applyStageTarget();
    optimizeContent();
  });

  // Drawer OCR Button
  $('openOcrFromDrawerBtn')?.addEventListener('click', () => {
    const modal = $('ocrModal');
    if (modal?.showModal) modal.showModal(); else modal?.setAttribute('open', 'true');
  });
}

/* ==========================================================================
   Initialization
   ========================================================================== */

renderOptionRows();
renderProfileSelect();
bind();
loadData();
renderAll();
