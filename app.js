import { calculateCombatPower, calculateDamage, calculatePvpDamage, calculateStatEfficiencies, cubeTargetSummary, probabilitySummary } from './engine.mjs';
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
  dropTableData: null
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
  arena: { label: '아레나', core: 'pvp', focus: 'boss', note: 'PvP 피해·생존 모델이 없어 자동 DPS 순위를 확정하지 않습니다.' },
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
    $('companionVerdict').className = 'verdict good';
    $('companionVerdict').textContent = `${selected.length < COMPANION_SLOT_COUNT ? `입력 ${selected.length}/${COMPANION_SLOT_COUNT}개 · ` : ''}${selectedCompanionScenario().label} · ${result.display}`;
  }
  if ($('companionSummary')) {
    $('companionSummary').textContent = companionSummary(selected, result, goal);
  }
}

function companionSummary(selected, result) {
  const statText = companionEffectText(result.stats);
  const ownText = selected.map(s => `${s.label}: ${companionLabel(s.job)} ${companionGradeLabel(s.grade)} Lv.${s.level} · 연동 공격 ${s.supporter?.linkedAttackStatBaseRatio ?? '—'}‰`).join('\n');
  return `[실제 동료 세팅 비교]
목표: ${selectedCompanionScenario().label}

입력 세팅 (총 ${selected.length}명)
${ownText}

장착 스탯 합계
${statText}

상대 DPS 배율
- ${result.display}
- ${result.impact.details.length ? result.impact.details.join(' · ') : '직접 계산 배율 없음'}
${result.impact.unknown.length ? '\n추가 기준값 필요: ' + [...new Set(result.impact.unknown)].join(', ') : ''}

※ 동료 장착 효과는 캐릭터 전투 계산 및 종합 전투력에 실시간 자동 반영됩니다.`;
}

/* --- Optimizer Search Algorithm --- */

function companionRarityScore(grade) {
  return ({ normal: 0, rare: 1, epic: 2, unique: 3, legendary: 4 }[grade] ?? 0);
}

function companionOptimizerStatScore(stats, type) {
  if (type === 'survival' || type === 'pvp') return 0;
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
    ? ['bossDamage', 'attackPlus', 'attackSpeed', 'critRate', 'critDamage']
    : (type === 'farm'
      ? ['normalDamage', 'attackPlus', 'attackSpeed', 'basicDamage', 'skillDamage']
      : ['attackPlus', 'bossDamage', 'normalDamage', 'attackSpeed', 'critRate', 'critDamage', 'maxDamage']);
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
    skillLevels: { first: 1, second: 1, third: 1, fourth: 1, all: 0 },
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

function fillJobs() {
  const sel = $('job');
  if (!sel) return;
  const jobs = DATA.jobs?.jobs || {};
  sel.innerHTML = '<option value="">직업 선택</option>';
  Object.entries(jobs).forEach(([id]) => sel.insertAdjacentHTML('beforeend', `<option value="${id}">${JOB_NAMES[id] || id}</option>`));
  renderJobStatMapping();
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
    statBased: '스탯 비례 데미지 (자동 산출)'
  };

  const STAT_CONFIG = [
    { target: 'bossDamage', keywords: ['보스 몬스터 데미지', '보스 몬스터데미지', '보스 몬스터', '보스데미지', '보스 데미지', '보뎀'] },
    { target: 'normalDamage', keywords: ['일반 몬스터 데미지', '일반 몬스터데미지', '일반 몬스터', '일반데미지', '일반 데미지', '일공'] },
    { target: 'damageAmp', keywords: ['데미지 증폭', '데미지증폭'] },
    { target: 'finalDamage', keywords: ['최종 데미지', '최종데미지', '최종 데미7', '치종 데미', '최종'] },
    { target: 'basicDamage', keywords: ['기본 공격 데미지', '기본공격데미지', '본 공격 데미지', '기본 공격'] },
    { target: 'skillDamage', keywords: ['스킬 데미지', '스킬데미지', 'AZ 데미지', 'AZ 데미', '스킬 데미^', '스킬 데미7', '스킬 데미'] },
    { target: 'critRate', keywords: ['크리티컬 확률', '크리티컬확률', '치명타 확률', '크확'] },
    { target: 'critDamage', keywords: ['크리티컬 데미지', '크리티컬데미지', '치명타 데미지', '크뎀'] },
    { target: 'defPen', keywords: ['방어 관통력', '방어관통력', '방어력 관통', '방관'] },
    { target: 'minDamage', keywords: ['최소 데미지 배율', '최소데미지 배율', '최소 데미지', '최소 데미'] },
    { target: 'maxDamage', keywords: ['최대 데미지 배율', '최대데미지 배율', '최대 데미지', '최대 데미'] },
    { target: 'attackSpeed', keywords: ['공격 속도', '공격속도'] },
    { target: 'playerDefense', keywords: ['방어력'] },
    { target: 'maxHp', keywords: ['최대 HP', '최대HP', '최대16', '최대 16', '최대1P', '최대 1P', 'Hh HP', 'ZC HP', '치대 HP'] },
    { target: 'maxMp', keywords: ['최대 MP', '최대MP', '최대 mp', '최대”', '최대"', '최대 M', 'At MP', 'AL MP'] },
    { target: 'accuracy', keywords: ['명중', '명중률'] },
    { target: 'evasion', keywords: ['회피', '회피율'] },
    { target: 'statBased', keywords: ['스탯 비례 데미지', '스탯비례데미지', 'AEH 비례 데미지', 'AEH 비례', '스 비례 데미지', '스 비례', '비례 데미지', '스탯 비례', '스탯비례'] },
    { target: 'damage', keywords: ['데미지'] },
    { target: 'attack', keywords: ['공격력'] },
    { target: 'statSTR', keywords: ['STR', '518', 'S1R', 'SIR'] },
    { target: 'statDEX', keywords: ['DEX'] },
    { target: 'statINT', keywords: ['INT', 'I NT'] },
    { target: 'statLUK', keywords: ['LUK', 'L UK', 'ㄴ G', 'ㄴ (i)', 'ㄴ(i)', 'ㄴ i', 'ㄴ (|', 'ㄴ('] },
    { target: 'debuffResist', keywords: ['디버프 내성', '디버프내성'] },
    { target: 'extraTargets', keywords: ['기본 공격 대상 수 증가', '기본 공격 대상 수', '대상 수 증가'] },
    { target: 'cooldownReductionPct', keywords: ['스킬 재사용 대기시간 감소', '재사용 대기시간 감소'] },
    { target: 'mainStatPerLevel1', keywords: ['1레벨당 주 스탯', '1레벨당 주스탯', '1HES FAH', '1레벨당 FAR', '1레벨당'] }
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
        const plusMatch = line.match(/\+\s*[:;\-1]?\s*([0-9만억조,\.]+)/);
        if (plusMatch) {
          const val = parseKoreanNumber(plusMatch[1]);
          if (val !== null && val > 0) {
            if (detailHeader === 'attack') detected['attackFlat'] = val;
            else if (['statLUK', 'statSTR', 'statDEX', 'statINT'].includes(detailHeader)) {
              detected['mainStat'] = val;
              detected[detailHeader] = val;
            }
          }
        }
        const pctMatch = line.match(/%\s*[:;\-]?\s*([0-9만억조,\.]+)/);
        if (pctMatch) {
          const val = parseKoreanNumber(pctMatch[1]);
          if (val !== null && val > 0) {
            if (detailHeader === 'attack') detected['attackPct'] = val;
            else if (['statLUK', 'statSTR', 'statDEX', 'statINT'].includes(detailHeader)) {
              detected['mainStatPct'] = val;
            }
          }
        }
      }
      return detected;
    }

    // Format B: List Table
    for (const line of lines) {
      if (line.includes('자신이 적에게') || line.includes('스킬 효과로') || line.includes('예상 능력치')) continue;
      if (line.includes('초당') && line.includes('회복')) continue;

      for (const item of STAT_CONFIG) {
        if (item.keywords.some(kw => line.startsWith(kw) || line.includes(kw))) {
          let cleanLine = line;
          item.keywords.forEach(kw => { cleanLine = cleanLine.replace(kw, ''); });
          cleanLine = cleanLine.replace(/[ⓘi|()\[\]G!a_]/g, ' ').trim();

          const allNums = Array.from(cleanLine.matchAll(/([0-9만억조,\.]+%?)/g)).map(m => m[1]);
          if (allNums.length > 0) {
            let bestNumStr = allNums.find(n => n.includes('%')) || allNums[allNums.length - 1];
            const val = parseKoreanNumber(bestNumStr);
            if (val !== null && val > 0) {
              if (item.target === 'attack') {
                if (line.includes('%')) {
                  if (!detected['attackPct']) detected['attackPct'] = val;
                } else {
                  if (!detected['attackFlat']) detected['attackFlat'] = val;
                }
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
        const xSearchMin = Math.floor(origW * 0.28);
        const xSearchMax = Math.floor(origW * 0.72);

        const rowBrightCounts = new Array(origH).fill(0);
        for (let y = yStart; y < yEnd; y++) {
          let count = 0;
          for (let x = xSearchMin; x < xSearchMax; x++) {
            const idx = (y * origW + x) * 4;
            if (data[idx] >= 210 && data[idx + 1] >= 210 && data[idx + 2] >= 210) {
              count++;
            }
          }
          rowBrightCounts[y] = count;
        }

        const threshold = (xSearchMax - xSearchMin) * 0.25;
        let modalMinY = -1, modalMaxY = -1;
        for (let y = yStart; y < yEnd; y++) {
          if (rowBrightCounts[y] >= threshold) {
            if (modalMinY === -1) modalMinY = y;
            modalMaxY = y;
          }
        }

        let isModalFound = false;
        let cropX = 0, cropY = 0, cropW = origW, cropH = origH;

        if (modalMinY !== -1 && (modalMaxY - modalMinY) >= origH * 0.15) {
          let minX = origW, maxX = 0;
          for (let y = modalMinY; y <= modalMaxY; y++) {
            if (rowBrightCounts[y] < threshold) continue;
            let rowMinX = -1, rowMaxX = -1;
            for (let x = Math.floor(origW * 0.15); x < Math.floor(origW * 0.85); x++) {
              const idx = (y * origW + x) * 4;
              if (data[idx] >= 210 && data[idx + 1] >= 210 && data[idx + 2] >= 210) {
                if (rowMinX === -1) rowMinX = x;
                rowMaxX = x;
              }
            }
            if (rowMinX !== -1 && (rowMaxX - rowMinX) >= origW * 0.15) {
              if (rowMinX < minX) minX = rowMinX;
              if (rowMaxX > maxX) maxX = rowMaxX;
            }
          }

          // If minX included the highlighted button on the left (x < 0.25*origW)
          // and span is wide (> 0.45*origW), clip strictly to the detail card (x >= 0.31*origW)
          if (minX < origW * 0.25 && (maxX - minX) > origW * 0.45) {
            minX = Math.floor(origW * 0.31);
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

        Object.assign(pendingOcrStats, parsed);
      }
      await worker.terminate();

      const maxRawStat = Math.max(
        pendingOcrStats.statSTR || 0,
        pendingOcrStats.statDEX || 0,
        pendingOcrStats.statINT || 0,
        pendingOcrStats.statLUK || 0
      );
      if (maxRawStat > 0 && (!pendingOcrStats.mainStat || pendingOcrStats.mainStat < maxRawStat)) {
        pendingOcrStats.mainStat = maxRawStat;
      }

      const foundCount = Object.keys(pendingOcrStats).length;
      if (foundCount === 0) {
        if (statusEl) statusEl.textContent = `총 ${fileArray.length}개 이미지에서 스탯 수치를 감지하지 못했습니다. 글자가 선명한 스탯 팝업 스크린샷을 사용하세요.`;
      } else {
        if (statusEl) statusEl.textContent = `총 ${fileArray.length}개 이미지 분석 완료! ${foundCount}개 스탯 항목을 수집했습니다. 확인 후 적용을 누르세요.`;
        if (resultsEl) {
          resultsEl.innerHTML = Object.entries(pendingOcrStats).map(([field, val]) => {
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
  }
}

function renderAll() {
  renderJobStatMapping();
  renderCombat();
  renderCube();
  renderProbability();
  fillCubeSources();
}

async function loadData() {
  try {
    const [combat, stats, jobs, probabilities, potentialProbabilities, companionRuntime, companionRules, stageData, bossData, growthDungeonData, guildData, dropTableData] = await Promise.all([
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
      fetch('data/drop-table-data.json').then(r => r.json())
    ]);
    Object.assign(DATA, {
      combat, stats, jobs, probabilities, potentialProbabilities, companionRuntime, companionRules, stageData, bossData, growthDungeonData, guildData, dropTableData
    });
    companionDatabase = companionRuntime;
    fillJobs();
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
    if ($('probabilitySource')) {
      $('probabilitySource').textContent = `공식 설정 확률 데이터 로드 완료 · ${probabilities?.source?.verificationStatus || '검증 상태 확인 필요'}`;
    }
    if ($('stageDataStatus')) {
      $('stageDataStatus').textContent = `스테이지 데이터 로드 완료 · 사냥 ${stageData.hunt?.length || 0}개 · 도전 ${stageData.trial?.length || 0}개 · 보스/던전/길드 연동`;
    }
    setStatus('공식 전투·능력치·동료·확률 데이터 로드 완료 · 클라우드 준비 완료', 'good');
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
  document.querySelectorAll('#characterForm input,#characterForm select,#targetForm input,#targetForm select').forEach(el => {
    el.addEventListener('input', () => {
      renderCompanionEffect();
      if (['stageMode', 'stageChapter'].includes(el.id)) {
        if (el.id === 'stageMode') fillStageChapters(); else fillStages();
      } else if (el.id === 'stageSelect') {
        applyStageTarget();
        renderStageInfo();
      }
      renderCombat();
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
