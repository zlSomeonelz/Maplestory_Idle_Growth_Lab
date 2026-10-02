import { calculateCombatPower, calculateDamage, calculatePvpDamage, calculateStatEfficiencies, cubeTargetSummary, probabilitySummary } from './engine.mjs';
'use strict';
const STORE='maple-growth-lab-mvp-v1';
const DATA={combat:null,stats:null,jobs:null,probabilities:null,potentialProbabilities:null,companionRuntime:null,companionRules:null,stageData:null};
const JOB_NAMES={hero:'히어로',paladin:'팔라딘',darkKnight:'다크나이트',archMageIceLightning:'아크메이지(썬·콜)',archMageFirePoison:'아크메이지(불·독)',bishop:'비숍',bowmaster:'보우마스터',sniper:'신궁',nightLord:'나이트로드',shadower:'섀도어',viper:'바이퍼',captain:'캡틴',nightWalker:'나이트워커',windBreaker:'윈드브레이커'};

const RUNTIME_JOB={hero:'hero',paladin:'paladin',darkKnight:'dark-knight',archMageIceLightning:'archmage-il',archMageFirePoison:'archmage-fp',bishop:'bishop',bowmaster:'bowmaster',sniper:'marksman',nightLord:'night-lord',shadower:'shadower',viper:'viper',captain:'captain',nightWalker:'night-walker',windBreaker:'wind-breaker'};
const EFFECT_LABEL={attackPlus:'공격력(+) ',maxDamage:'최대 데미지%',bossDamage:'보스 데미지%',normalDamage:'일반 몬스터 데미지%',basicDamage:'기본 공격 데미지%',skillDamage:'스킬 데미지%',attackSpeed:'공격 속도%',critRate:'크리티컬 확률%',critDamage:'크리티컬 데미지%',minDamage:'최소 데미지 배율%',mainPct:'주스탯%'};
function selectedCompanionEffect(){const presetEffect=window.MapleGrowthCompanion?.getEffect?.();if(presetEffect)return presetEffect;const rt=DATA.companionRuntime;if(!rt)return null;const job=RUNTIME_JOB[$('job')?.value];const grade=$('companionGrade')?.value;if(!job||!grade)return null;const rec=rt.equippedStats?.[job+':'+grade];if(!rec||!rec.levels?.length)return null;const level=clamp(n('companionLevel')||1,1,rec.levels.length);return {level,grade,record:rec,values:rec.levels[level-1]||{}}}
function renderCompanionEffect(){const c=selectedCompanionEffect(),box=$('companionEffect');if(!box)return;if(!c){box.textContent='직업과 등급을 선택하면 장착 효과를 표시합니다.';return}const rows=Object.entries(c.values).map(([key,val])=>`<span>${EFFECT_LABEL[key]||key} <b>${val}</b></span>`).join('');box.innerHTML=`<div class="effect-list">${rows||'<span>표시할 장착 효과 없음</span>'}</div><span class="effect-warning">동료 자체 공격과 조건부 스킬은 발동 조건·소환 주기 검증 전까지 DPS에 자동 합산하지 않습니다.</span>`}
const STAT_OPTIONS=[['NONE','없음'],['ATK_FLAT','공격력(+)'],['ATK_PCT','공격력%'],['MAIN_STAT_FLAT','주스탯(+)'],['MAIN_STAT_PCT','주스탯%'],['SUB_STAT_FLAT','부스탯(+)'],['SUB_STAT_PCT','부스탯%'],['MAX_HP','최대 HP(+)'],['PLAYER_DEFENSE','방어력(+)'],['MAX_MP','최대 MP(+)'],['FIXED_CDR','쿨타임 감소(초)'],['COOLDOWN_PCT','쿨타임 감소%'],['DMG','데미지%'],['DMG_AMP','데미지 증폭%'],['FINAL_DMG','최종 데미지%'],['BOSS_DMG','보스 데미지%'],['NORMAL_DMG','일반 몬스터 데미지%'],['DEF_PEN','방어 관통력%'],['CRIT_RATE','크리티컬 확률%'],['CRIT_DMG','크리티컬 데미지%'],['MIN_DAMAGE','최소 데미지 배율%'],['MAX_DAMAGE','최대 데미지 배율%'],['ATK_BASIC_DMG','기본 공격 데미지%'],['SKILL_DMG','스킬 데미지%'],['BUFF_DURATION','버프 지속시간%'],['COMPANION_DURATION','동료 소환 지속시간%'],['TARGET_COUNT_INC','기본 공격 대상 수(+)'],['ALL_SKILL_LEVEL','모든 스킬 레벨(+)']];
const $=id=>document.getElementById(id); const n=id=>Number($(id)?.value||0); const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)); const pct=v=>1+Number(v||0)/100; const fmt=v=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:2}):'—';
function setStatus(text,kind=''){const el=$('dataStatus');el.textContent=text;el.className='status-strip '+kind;}
function snapshot(){const out={};document.querySelectorAll('input[id],select[id]').forEach(el=>{if(['presetName','presetSelect'].includes(el.id))return;out[el.id]=el.type==='checkbox'?el.checked:el.value});return out}
function applySnapshot(s){Object.entries(s||{}).forEach(([id,v])=>{const el=$(id);if(!el)return;if(el.type==='checkbox')el.checked=!!v;else el.value=v});renderAll();}
function saveLocal(){localStorage.setItem(STORE,JSON.stringify(snapshot()));}
function loadLocal(){try{const s=JSON.parse(localStorage.getItem(STORE)||'null');if(s)applySnapshot(s)}catch{}}
function profiles(){try{return JSON.parse(localStorage.getItem(STORE+'-profiles')||'{}')}catch{return {}}}
function saveProfiles(p){localStorage.setItem(STORE+'-profiles',JSON.stringify(p));renderProfileSelect()}
function renderProfileSelect(){const sel=$('presetSelect'),p=profiles();sel.innerHTML='<option value="">저장된 프리셋 없음</option>'+Object.keys(p).sort().map(k=>`<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('')}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function optionSelect(value){return `<select class="option-stat">${STAT_OPTIONS.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${label}</option>`).join('')}</select>`}
function renderOptionRows(){for(const id of ['currentOptions','candidateOptions'])$(id).innerHTML=[0,1,2].map(i=>`<div class="option-row">${optionSelect('NONE')}<input class="option-value" type="number" step="0.01" value="0" aria-label="${id} 옵션 ${i+1} 값"></div>`).join('')}
function valuesFor(root){const out={};$(root).querySelectorAll('.option-row').forEach(row=>{const stat=row.querySelector('.option-stat').value;const val=Number(row.querySelector('.option-value').value||0);if(stat!=='NONE'&&val)out[stat]=(out[stat]||0)+val});return out}
const CUBE_GRADE_NAMES={normal:'노말',rare:'레어',epic:'에픽',unique:'유니크',legendary:'레전드리',mystic:'미스틱'};
function cubeBlocks(){return DATA.potentialProbabilities?.grades?.[$('cubeGrade')?.value]?.blocks||[]}
function selectedCubeBlock(){const equipment=$('cubeEquipment')?.value,slot=Number($('cubeSlot')?.value||1);return cubeBlocks().find(block=>block.equipment===equipment&&block.slot===slot)||null}
function parseCubeOption(label){const text=String(label||'');const valueMatch=text.match(/([0-9]+(?:\.[0-9]+)?)\s*(%|초)?$/);if(!valueMatch)return null;const value=Number(valueMatch[1]);const percent=Boolean(valueMatch[2]);const name=text.slice(0,valueMatch.index).trim();const direct={'크리티컬 확률':'CRIT_RATE','공격 속도':'ATK_SPEED','데미지':'DMG','최소 데미지 배율':'MIN_DAMAGE','최대 데미지 배율':'MAX_DAMAGE','방어력':'PLAYER_DEFENSE','최대 HP':'MAX_HP','최대 MP':'MAX_MP','기본 공격 데미지':'ATK_BASIC_DMG','스킬 데미지':'SKILL_DMG','보스 몬스터 데미지':'BOSS_DMG','일반 몬스터 데미지':'NORMAL_DMG','데미지 증폭':'DMG_AMP','최종 데미지':'FINAL_DMG','크리티컬 데미지':'CRIT_DMG','방어 관통력':'DEF_PEN','버프 지속시간 증가':'BUFF_DURATION','동료 소환 지속시간 증가':'COMPANION_DURATION','기본 공격 대상 수 증가':'TARGET_COUNT_INC','모든 스킬 레벨':'ALL_SKILL_LEVEL'};if(direct[name])return {stat:direct[name],value,percent};const job=DATA.jobs?.jobs?.[$('job')?.value]||{};if(['STR','DEX','INT','LUK'].includes(name)){const isMain=(job.main||[]).includes(name);return {stat:percent?(isMain?'MAIN_STAT_PCT':'SUB_STAT_PCT'):(isMain?'MAIN_STAT_FLAT':'SUB_STAT_FLAT'),value,percent}}if(name==='스킬 재사용 대기시간 감소')return percent?{stat:'COOLDOWN_PCT',value,percent}:{stat:'FIXED_CDR',value,percent};return null}
function fillCubeGoalSelects(options){const values=['',...options.map(item=>item.option)];for(const [index,id] of ['cubeGoal1','cubeGoal2','cubeGoal3'].entries()){const sel=$(id);if(!sel)continue;const previous=sel.value;sel.innerHTML=values.map(value=>`<option value="${escapeHtml(value)}">${value?escapeHtml(value):'목표 없음'}</option>`).join('');if(previous&&values.includes(previous))sel.value=previous;else if(index===0&&options[0])sel.value=options[0].option;else sel.value=''}}
function fillCubeSources(){const grade=$('cubeGrade'),equipment=$('cubeEquipment'),slot=$('cubeSlot'),option=$('cubeOptionSelect');if(!grade||!equipment||!slot||!option)return;const grades=DATA.potentialProbabilities?.grades||{};const previousGrade=grade.value||'epic';grade.innerHTML=Object.keys(grades).map(key=>`<option value="${key}">${CUBE_GRADE_NAMES[key]||key}</option>`).join('');grade.value=grades[previousGrade]?previousGrade:(Object.keys(grades)[0]||'');const blocks=cubeBlocks();const equipments=[...new Set(blocks.map(block=>block.equipment))];const currentEquipment=equipment.value;equipment.innerHTML=equipments.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');if(equipments.includes(currentEquipment))equipment.value=currentEquipment;const maxSlot=Math.max(1,...blocks.filter(block=>block.equipment===equipment.value).map(block=>Number(block.slot)||1));const currentSlot=Number(slot.value)||1;slot.innerHTML=Array.from({length:maxSlot},(_,i)=>`<option value="${i+1}">${i+1}번 슬롯</option>`).join('');slot.value=String(Math.min(currentSlot,maxSlot));const block=selectedCubeBlock();const options=block?.options||[];fillCubeGoalSelects(options);option.innerHTML=options.length?options.map((item,i)=>`<option value="${i}">${escapeHtml(item.option)} · ${item.settingPercent}%</option>`).join(''):'<option value="">확률 데이터 없음</option>';if(options.length){option.value='0';setCubeProbability()}else{$('cubeProbability').value=0;$('cubeProbabilitySource').textContent='선택한 등급·장비·슬롯의 확률 데이터가 없습니다.'}renderCubeTargetSummary()}
function setCubeProbability(){const block=selectedCubeBlock(),index=Number($('cubeOptionSelect')?.value||0),item=block?.options?.[index];if(!item)return;$('cubeProbability').value=item.settingPercent;$('cubeProbabilitySource').textContent=`${CUBE_GRADE_NAMES[$('cubeGrade').value]||$('cubeGrade').value} · ${block.equipment} · ${block.slot}번 슬롯 · 설정 확률 ${item.settingPercent}%`}
function renderCubeTargetSummary(){const box=$('cubeTargetSummary');if(!box)return;const equipment=$('cubeEquipment')?.value;const blocks=cubeBlocks().filter(block=>block.equipment===equipment).sort((a,b)=>Number(a.slot)-Number(b.slot));const goals=['cubeGoal1','cubeGoal2','cubeGoal3'].map(id=>$(id)?.value).filter(Boolean);if(!goals.length||!blocks.length){box.textContent='목표 옵션을 선택하면 3개 슬롯 기준 기대값을 계산합니다.';return}const slotOptions=blocks.map(block=>block.options||[]);const mode=$('cubeGoalMode')?.value||'any';const result=cubeTargetSummary(slotOptions,goals,mode,n('cubeCost'));const slots=result.slotProbabilities.map((value,index)=>`${index+1}번 ${(value*100).toFixed(4)}%`).join(' · ');const modeLabel=mode==='all'?'선택한 목표 모두':'선택한 목표 중 하나 이상';const rerollInfo=result.rerollExclusion?.rerollAdjusted?`<br><small>※ 동일 옵션 3슬롯 재설정 보정: 동일 조합 확률 ${(result.rerollExclusion.sameProbability*100).toFixed(6)}% (현재 목표 ${result.rerollExclusion.currentIsGoal?'포함':'미포함'})</small>`:'<br><small>※ 기존 옵션과 3슬롯(종류·수치·순서)이 완전히 동일하면 다른 결과가 나올 때까지 재설정 규칙 반영</small>';box.innerHTML=`<strong>3슬롯 목표 옵션 분석</strong><br><span>${goals.map(escapeHtml).join(' + ')}</span><br><small>${modeLabel} · 슬롯별 독립 확률: ${slots}</small>${rerollInfo}<br>1회 큐브 달성 확률 <b>${(result.probability*100).toFixed(4)}%</b> · 기대 횟수 <b>${fmt(result.expectedAttempts)}회</b>${result.expectedCost==null?'':' · 기대 메소 <b>'+fmt(result.expectedCost)+'</b>'}`}

function applySelectedCubeOption(){const block=selectedCubeBlock(),item=block?.options?.[Number($('cubeOptionSelect')?.value||0)],parsed=item&&parseCubeOption(item.option);if(!parsed)return;const row=$('candidateOptions')?.querySelector('.option-row');if(!row)return;row.querySelector('.option-stat').value=parsed.stat;row.querySelector('.option-value').value=parsed.value;renderCube()}

function renderJobStatMapping(){const box=$('jobStatMapping');if(!box)return;const job=DATA.jobs?.jobs?.[$('job')?.value];if(!job){box.textContent='직업을 선택하면 주·부 스탯 매핑을 표시합니다.';return}const mode=$('statInputMode')?.value||'aggregate';const main=(job.main||[]).join(', ')||'미확인';const sub=(job.sub||[]).join(', ')||'미확인';box.innerHTML=`주스탯 <b>${main}</b> · 부스탯 <b>${sub}</b> · ${mode==='job'?'원시 스탯 입력을 계산에 사용합니다.':'주·부 스탯 합산값을 직접 사용합니다.'}`;}
function fillJobs(){const sel=$('job');const jobs=DATA.jobs?.jobs||{};Object.entries(jobs).forEach(([id])=>sel.insertAdjacentHTML('beforeend',`<option value="${id}">${JOB_NAMES[id]||id}</option>`));renderJobStatMapping();renderCompanionEffect()}
function stageRows(){
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
function fillStageChapters(){const sel=$('stageChapter');if(!sel)return;const chapters=[...new Set(stageRows().map(x=>x.chapter))];chapters.sort((a,b)=>{if(typeof a==='number'&&typeof b==='number')return a-b;return String(a).localeCompare(String(b),'ko')});const current=sel.value;const next=current||String(chapters[0]||'');sel.innerHTML='<option value="">구분/챕터 선택</option>'+chapters.map(c=>`<option value="${c}">${typeof c==='number'?c+'장':c}</option>`).join('');if(chapters.map(String).includes(String(next)))sel.value=next;fillStages()}
function fillStages(){const chapter=$('stageChapter')?.value||'';const sel=$('stageSelect');if(!sel)return;const rows=stageRows().filter(x=>!chapter||String(x.chapter)===String(chapter));const current=sel.value;sel.innerHTML='<option value="">단계/스테이지 선택</option>'+rows.map((x,i)=>`<option value="${x.stage}">${x.stage} · ${x.category||'일반'}</option>`).join('');if(rows.some(x=>String(x.stage)===String(current)))sel.value=current;applyStageTarget()}
function selectedStage(){const stage=$('stageSelect')?.value;return stage?stageRows().find(x=>String(x.stage)===String(stage))||null:null}
function applyStageTarget(){const row=selectedStage();if(!row)return;const def=(Number(row.Defence_min||0)+Number(row.Defence_max||row.Defence_min||0))/2;const isBoss=row.category==='보스'||row.category==='파티보스'||row.category==='월드보스'||(Boolean(row.BossHp_min)&&!row.NormalHp_min);const hpKey=$('stageMode').value==='trial'?(isBoss?'BossHp':'NormalHp'):'MaxHp';const minVal=Number(row[hpKey+'_min'])||Number(row.MaxHp_min)||Number(row.BossHp_min)||Number(row.NormalHp_min)||0;const maxVal=Number(row[hpKey+'_max'])||Number(row.MaxHp_max)||Number(row.BossHp_max)||Number(row.NormalHp_max)||minVal;const hp=(minVal+maxVal)/2;if(def)$('targetDefense').value=def;if(hp)$('targetHp').value=hp;if(row.time_sec)$('stageTimeLimit').value=row.time_sec;if($('targetType').value!=='pvp')$('targetType').value=isBoss?'boss':'normal';renderStageVerdict()}
function stageSensitivity(){const target=$('targetType').value;const candidates=[['공격력', 'ATK_FLAT',100],['데미지', 'DMG',10],[target==='boss'?'보스 데미지':'일반 몬스터 데미지',target==='boss'?'BOSS_DMG':'NORMAL_DMG',10],['방어 관통력','DEF_PEN',10],['주스탯','MAIN_STAT_FLAT',1000],['크리티컬 데미지','CRIT_DMG',10],['공격 속도','ATK_SPEED',10]];const base=calculate();return candidates.map(([name,stat,amount])=>({name,stat,amount,delta:calculate({[stat]:amount}).dps-base.dps})).sort((a,b)=>b.delta/a.amount-b.delta/a.amount)}
function renderStageVerdict(){const box=$('stageVerdict');if(!box)return;const row=selectedStage(),r=calculate(),hp=n('targetHp'),limit=n('stageTimeLimit');if(!row||!hp){box.className='stage-verdict';box.innerHTML='목표 스테이지를 선택하면 클리어 가능성과 병목을 진단합니다.';return}const total=r.dps*limit,ratio=hp?total/hp:0;const clear=total>=hp;const ranked=stageSensitivity().slice(0,3);box.className='stage-verdict '+(clear?'good':'warn');box.innerHTML=`<strong>${row.stage} 목표 · ${clear?'클리어 가능':'현재 화력 부족'}</strong><div class="stage-meta">${fmt(r.dps)} DPS × ${limit}초 = ${fmt(total)} · 적 HP ${fmt(hp)} · 필요 비율 ${ratio.toFixed(2)}배</div><div class="bottleneck-list"><span><b>1순위 병목</b><b>${escapeHtml(ranked[0]?.name||'분석 중')} +${fmt(ranked[0]?.delta||0)} DPS</b></span><span><b>2순위</b><b>${escapeHtml(ranked[1]?.name||'—')} +${fmt(ranked[1]?.delta||0)} DPS</b></span><span><b>3순위</b><b>${escapeHtml(ranked[2]?.name||'—')} +${fmt(ranked[2]?.delta||0)} DPS</b></span></div>`}
function renderStatEfficiencies(){const box=$('statEfficiencyBox');if(!box)return;const inputs=readInputs();const effs=calculateStatEfficiencies(inputs,DATA.combat||{});if(!effs.length){box.innerHTML='';return}const topRows=effs.slice(0,6).map((item,index)=>`<div class="efficiency-row"><span class="eff-rank">${index+1}위</span><span class="eff-label">${escapeHtml(item.label)}</span><span class="eff-delta">+${fmt(item.deltaDps)} DPS</span><span class="eff-badge">${item.ratioPct>=0?'+':''}${item.ratioPct.toFixed(2)}%</span></div>`).join('');box.innerHTML=`<div class="section-heading" style="margin-top:14px;"><div><h3>⚡ 스탯 / 옵션 1%당 딜 효율 순위</h3></div><span class="badge official">현재 상태 기준 한계 효율</span></div><p class="hint">현재 캐릭터 스탯 상태에서 각 옵션을 1% (또는 1,000) 올렸을 때의 예상 DPS 증가 비율입니다.</p><div class="efficiency-grid">${topRows}</div>`;}
function readInputs(extra={}){const target=$('targetType').value;const job=DATA.jobs?.jobs?.[$('job').value]||{};const rawStats={STR:n('statSTR'),DEX:n('statDEX'),INT:n('statINT'),LUK:n('statLUK')};const mappedMain=(job.main||[]).reduce((sum,key)=>sum+(rawStats[key]||0),0);const mappedSub=(job.sub||[]).reduce((sum,key)=>sum+(rawStats[key]||0),0);const useJobStats=$('statInputMode')?.value==='job';const main=(useJobStats?mappedMain:n('mainStat'))*pct(n('mainStatPct'));const sub=useJobStats?mappedSub:n('subStat');const statBased=(main/100+sub/400);const stats={attackFlat:n('attackFlat'),attackPct:n('attackPct'),maxHp:n('maxHp'),playerDefense:n('playerDefense'),maxMp:n('maxMp'),evasion:n('evasion'),statusDamage:n('statusDamage'),buffDuration:n('buffDuration'),companionSummonDuration:n('companionSummonDuration'),fixedCooldownReductionSeconds:n('fixedCooldownReductionSeconds'),cooldownReductionPercent:n('cooldownReductionPercent'),basicAttackTargetCountIncrease:n('basicAttackTargetCountIncrease'),receivedDamageReduction:n('receivedDamageReduction'),mainStat:main,subStat:sub,statBased,damage:n('damage'),damageAmp:n('damageAmp'),finalDamage:n('finalDamage'),critRate:n('critRate'),critDamage:n('critDamage'),minDamage:n('minDamage'),maxDamage:n('maxDamage'),mastery:n('mastery'),skillCoefficient:n('skillCoefficient'),attackInterval:n('attackInterval'),attackSpeed:n('attackSpeed'),attackSpeedAdditions:[],defPenAdditions:[],targetDefense:n('targetDefense'),targetMaxHp:n('targetHp'),targetReceivedDamageReduction:n('targetReceivedDamageReduction'),pvpContent:$('pvpContent')?.value||'arena',defPen:n('defPen'),bossDamage:n('bossDamage'),normalDamage:n('normalDamage'),targetTaken:n('targetTaken'),basicDamage:n('basicDamage'),skillDamage:n('skillDamage'),accuracy:n('accuracy'),skillLevels:{first:n('firstSkillLevel'),second:n('secondSkillLevel'),third:n('thirdSkillLevel'),fourth:n('fourthSkillLevel'),all:n('allSkillLevel')},masteries:{main80k:n('mainMasteryCount'),sub25k:n('subMasteryCount')},target,job,level:n('level')};
  Object.entries(extra).forEach(([k,v])=>{if(k==='MAIN_STAT_FLAT')stats.mainStat+=v;else if(k==='MAIN_STAT_PCT')stats.mainStat*=pct(v);else if(k==='SUB_STAT_FLAT')stats.subStat+=v;else if(k==='SUB_STAT_PCT')stats.subStat*=pct(v);else if(k==='MAX_HP')stats.maxHp+=Number(v)||0;else if(k==='PLAYER_DEFENSE')stats.playerDefense+=Number(v)||0;else if(k==='MAX_MP')stats.maxMp+=Number(v)||0;else if(k==='FIXED_CDR')stats.fixedCooldownReductionSeconds+=Number(v)||0;else if(k==='COOLDOWN_PCT')stats.cooldownReductionPercent+=Number(v)||0;else if(k==='ATK_BASIC_DMG')stats.basicDamage+=Number(v)||0;else if(k==='SKILL_DMG')stats.skillDamage+=Number(v)||0;else if(k==='ATK_FLAT')stats.attackFlat+=v;else if(k==='ATK_PCT')stats.attackPct+=v;else if(k==='DMG')stats.damage+=v;else if(k==='DMG_AMP')stats.damageAmp+=v;else if(k==='FINAL_DMG')stats.finalDamage+=v;else if(k==='BOSS_DMG')stats.bossDamage+=v;else if(k==='NORMAL_DMG')stats.normalDamage+=v;else if(k==='DEF_PEN'){stats.defPenAdditions.push(Number(v)||0);stats.defPen+=Number(v)||0;}else if(k==='ATK_SPEED'){stats.attackSpeedAdditions.push(Number(v)||0);stats.attackSpeed+=Number(v)||0;}else if(k==='CRIT_RATE')stats.critRate+=v;else if(k==='CRIT_DMG')stats.critDamage+=v;else if(k==='MIN_DAMAGE')stats.minDamage+=v;else if(k==='MAX_DAMAGE')stats.maxDamage+=v;else if(k==='BUFF_DURATION')stats.buffDuration+=v;else if(k==='COMPANION_DURATION')stats.companionSummonDuration+=v;else if(k==='TARGET_COUNT_INC')stats.basicAttackTargetCountIncrease+=v;else if(k==='ALL_SKILL_LEVEL')stats.skillLevels.all=(stats.skillLevels.all||0)+v;});
  const companion=selectedCompanionEffect();if(companion){for(const [key,val] of Object.entries(companion.values)){if(key==='attackPlus')stats.attackFlat+=Number(val)||0;else if(key==='maxDamage')stats.maxDamage+=Number(val)||0;else if(key==='bossDamage')stats.bossDamage+=Number(val)||0;else if(key==='normalDamage')stats.normalDamage+=Number(val)||0;else if(key==='basicDamage')stats.basicDamage+=Number(val)||0;else if(key==='skillDamage')stats.skillDamage+=Number(val)||0;else if(key==='attackSpeed'){stats.attackSpeedAdditions.push(Number(val)||0);stats.attackSpeed+=Number(val)||0;}else if(key==='critRate')stats.critRate+=Number(val)||0;else if(key==='critDamage')stats.critDamage+=Number(val)||0;else if(key==='minDamage')stats.minDamage+=Number(val)||0;else if(key==='mainPct')stats.mainStat*=pct(val)}}stats.statBased=stats.mainStat/100+stats.subStat/400;return stats;
}
function calculate(extra={}){const inputs=readInputs(extra);return inputs.target==='pvp'?calculatePvpDamage(inputs, DATA.combat||{}):calculateDamage(inputs, DATA.combat||{});}
function calculatePower(extra={}){return calculateCombatPower(readInputs(extra), DATA.combat||{});}
function renderSpecUpGuide(){const box=$('specUpGuideContent');if(!box)return;const target=$('targetType')?.value||'normal';const r=calculate();const dpsVal=r.dps;let targetLabel=target==='boss'?'보스 몬스터 (레이드·월드보스·길드토벌)':target==='pvp'?'PvP 대항전 (아레나·월드아레나·콜로세움)':'일반 몬스터 (챕터 사냥·도전·던전)';let priorityStats=[];if(target==='boss'){priorityStats=[{name:'보스 몬스터 데미지%',reason:'보스 대상 직접 곱연산 적용 (동료 레전더리/유니크 1순위 스탯)'},{name:'크리티컬 데미지%',reason:'크리티컬 확률 확보 후 최고의 DPS 증폭 multiplier'},{name:'방어 관통력%',reason:'보스 적 방어력 감쇄를 통한 데미지 감소 무력화'},{name:'최종 데미지%',reason:'모든 공격력 계산의 최후 1.xx배 곱연산'}];}else if(target==='pvp'){priorityStats=[{name:'명중률% & 크리티컬 저항%',reason:'상대 회피/크저 차감 후 순수 유효 피해 전달'},{name:'방어 관통력%',reason:'PvP 고방어력 상대 극복 필수 스탯'},{name:'받는 피해 감소%',reason:'PvP 승패 결정 생존력 향상'}];}else{priorityStats=[{name:'일반 몬스터 데미지%',reason:'챕터 사냥 및 일반 던전 몬스터 대상 직접 곱연산'},{name:'기본 공격 데미지%',reason:'동료 스킬 및 기본 타격 DPS 비중 강화'},{name:'공격 속도%',reason:'상한선(150%)까지 빠른 타격 주기 확보'}];}box.innerHTML=`<div style="display:grid;gap:10px;margin-top:6px;"><div style="background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:10px 12px;"><span style="font-size:12px;color:var(--muted);font-weight:700;">🎯 대상 콘텐츠: ${targetLabel}</span><div style="font-size:16px;font-weight:900;color:var(--primary-dark);margin-top:2px;">예상 전투 DPS: ${fmt(dpsVal)}</div></div><div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;"><strong style="font-size:13px;color:var(--ink);">🔥 이 콘텐츠 최적화 동료·유물 1순위 옵션</strong><ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:#475467;">${priorityStats.map(item=>`<li style="margin-bottom:4px;"><b>${escapeHtml(item.name)}</b> — ${escapeHtml(item.reason)}</li>`).join('')}</ul></div><div style="background:#eef0ff;border:1px solid #d8d8ff;border-radius:10px;padding:10px 12px;font-size:12px;color:var(--primary-dark);">💡 <b>동료 1-Click 자동 세팅 사용법:</b> 상단 [02 콘텐츠 프리셋] 카드에서 [동료] 탭을 연 뒤 <code>🚀 1-Click 최적 동료 조합 세팅</code> 버튼을 누르면 직업·등급별 최고 스탯 동료 6마리가 자동 장착됩니다.</div></div>`;}
function renderCombat(){const r=calculate();const power=calculatePower();$('avgDamage').textContent=fmt(r.average);$('damageRange').textContent=`최소 ${fmt(r.min)} · 최대 ${fmt(r.max)}`;$('dps').textContent=fmt(r.dps);$('dpsNote').textContent=`공속 점감 후 ${r.effectiveAttackSpeed.toFixed(2)}% · 보정 ×${r.speedFactor.toFixed(3)} · 간격 ${n('attackInterval')}초${$('targetType').value==='pvp'?` · PvP 레벨 보정 ×${r.levelAdjustment.toFixed(4)}`:''}`;$('combatPower').textContent=fmt(power.power);$('combatPowerNote').textContent=power.provisional?`공식식 적용 · 미입력 보조 능력치 ${power.missingInputs.length}개는 0 처리`:'공식식 적용';$('defenseFactor').textContent=(r.defenseFactor*100).toFixed(2)+'%';$('defenseNote').textContent=`관통 점감 후 ${r.effectiveDefPen.toFixed(2)}% · 방어력 ${fmt(n('targetDefense'))} → ${fmt(r.afterDef)}`;$('statDamage').textContent=r.statBased.toFixed(2)+'%';$('combatBreakdown').innerHTML=`<div class="breakdown-grid"><span>공격력<b>${fmt(r.attack)}</b></span><span>치명타 기대 배율<b>×${(1+r.critChance*n('critDamage')/100).toFixed(3)}</b></span><span>대상 보정<b>${$('targetType').value==='boss'?n('bossDamage'):n('normalDamage')}%</b></span></div>`;renderStageVerdict();renderStatEfficiencies();renderSpecUpGuide();saveLocal()}

function renderCube(){const current=calculate(valuesFor('currentOptions'));const candidate=calculate(valuesFor('candidateOptions'));const currentPower=calculatePower(valuesFor('currentOptions'));const candidatePower=calculatePower(valuesFor('candidateOptions'));$('cubeCurrentDps').textContent=fmt(current.dps);$('cubeCandidateDps').textContent=fmt(candidate.dps);const delta=candidate.dps-current.dps;const rate=current.dps?delta/current.dps*100:0;$('cubeDelta').textContent=`${delta>=0?'+':''}${fmt(delta)} (${rate>=0?'+':''}${rate.toFixed(2)}%)`;if($('cubeCurrentPower'))$('cubeCurrentPower').textContent=fmt(currentPower.power);if($('cubeCandidatePower'))$('cubeCandidatePower').textContent=fmt(candidatePower.power);const powerDelta=candidatePower.power-currentPower.power;const powerRate=currentPower.power?powerDelta/currentPower.power*100:0;if($('cubePowerDelta'))$('cubePowerDelta').textContent=`${powerDelta>=0?'+':''}${fmt(powerDelta)} (${powerRate>=0?'+':''}${powerRate.toFixed(2)}%)`;const p=n('cubeProbability')/100,cost=n('cubeCost');$('cubeEconomics').innerHTML=p>0?`후보 1회 달성 기대 횟수 <b>${fmt(1/p)}회</b> · 기대 메소 <b>${fmt(1/p*cost)}</b><br><small>확률이 없는 값은 기대 비용을 계산하지 않습니다.</small>`:'등장 확률을 입력하면 기대 횟수와 비용을 계산합니다.';renderCubeTargetSummary()}
function renderProbability(){const r=probabilitySummary(n('successRate'),n('attempts'),n('attemptCost'));if(!r.probability&&r.expectedAttempts===Infinity){$('probabilityResult').innerHTML='<div class="big-prob">0%</div>성공 확률이 0이면 달성 확률과 기대값은 계산할 수 없습니다.';return}$('probabilityResult').innerHTML=`<div class="big-prob">${(r.probability*100).toFixed(4)}%</div><ul><li>${r.attempts}회 안에 1회 이상 성공할 확률: <b>${(r.probability*100).toFixed(4)}%</b></li><li>평균 기대 시도 횟수: <b>${fmt(r.expectedAttempts)}회</b></li><li>평균 기대 비용: <b>${r.expectedCost==null?'미입력':fmt(r.expectedCost)}</b></li><li>90% 달성 필요 횟수: <b>${r.need90}회</b></li><li>95% 달성 필요 횟수: <b>${r.need95}회</b></li></ul>`}
function renderAll(){renderJobStatMapping();renderCombat();renderCube();renderProbability();fillCubeSources()}
async function loadData(){try{const [combat,stats,jobs,probabilities,potentialProbabilities,companionRuntime,companionRules,stageData,bossData,growthDungeonData,guildData,dropTableData]=await Promise.all([fetch('data/combat-rules.json').then(r=>r.json()),fetch('data/stat-rules.json').then(r=>r.json()),fetch('data/job-stats.json').then(r=>r.json()),fetch('data/probabilities.json').then(r=>r.json()),fetch('data/potential-probabilities.json').then(r=>r.json()),fetch('data/companion-runtime-data.json').then(r=>r.json()),fetch('data/companion-rules.json').then(r=>r.json()),fetch('data/stage-data.json').then(r=>r.json()),fetch('data/boss-data.json').then(r=>r.json()),fetch('data/growth-dungeon-data.json').then(r=>r.json()),fetch('data/guild-data.json').then(r=>r.json()),fetch('data/drop-table-data.json').then(r=>r.json())]);Object.assign(DATA,{combat,stats,jobs,probabilities,potentialProbabilities,companionRuntime,companionRules,stageData,bossData,growthDungeonData,guildData,dropTableData});fillJobs();fillStageChapters();loadLocal();fillStageChapters();renderCompanionEffect();$('probabilitySource').textContent=`공식 설정 확률 데이터 로드 완료 · ${probabilities?.source?.verificationStatus||'검증 상태 확인 필요'}`;setStatus(`공식 전투·능력치·확률 데이터 로드 완료 · 직업 매핑은 ${jobs.status||'provisional'}`, 'good');renderAll()}catch(e){setStatus('데이터 파일을 불러오지 못했습니다. 기본 입력으로 계산하지만 공식 데이터 상태를 확인하세요.','bad');$('probabilitySource').textContent='확률 데이터 로드 실패: '+e.message;renderAll()}}

let pendingOcrStats={};
function initOcrModal(){
  const modal=$('ocrModal');
  const openBtns=[$('openOcrModalBtn'),$('openOcrInFormBtn')].filter(Boolean);
  const closeBtn=$('closeOcrModalBtn');
  const runBtn=$('runOcrModalBtn');
  const applyBtn=$('applyOcrModalBtn');
  const clipBtn=$('ocrPasteClipboardBtn');
  const fileInput=$('ocrModalFile');
  const dropZone=$('ocrModalDrop');
  const statusEl=$('ocrModalStatus');
  const resultsEl=$('ocrModalResults');
  if(!modal)return;

  openBtns.forEach(btn=>btn?.addEventListener('click',()=>{
    if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','true');
    dropZone?.focus();
  }));
  closeBtn?.addEventListener('click',()=>{
    if(typeof modal.close==='function')modal.close();else modal.removeAttribute('open');
  });

  const STAT_FIELD_MAP=[
    {label:'공격력 합계',target:'attackFlat',keywords:['공격력 합계','공격력']},
    {label:'공격력%',target:'attackPct',keywords:['공격력%']},
    {label:'주스탯(+)',target:'mainStat',keywords:['주 스탯 수치','주스탯 수치','주스탯(+)']},
    {label:'주스탯%',target:'mainStatPct',keywords:['주 스탯%','주스탯%']},
    {label:'부스탯(+)',target:'subStat',keywords:['부 스탯 수치','부스탯 수치','부스탯(+)']},
    {label:'데미지%',target:'damage',keywords:['데미지']},
    {label:'데미지 증폭%',target:'damageAmp',keywords:['데미지 증폭']},
    {label:'최종 데미지%',target:'finalDamage',keywords:['최종 데미지']},
    {label:'보스 데미지%',target:'bossDamage',keywords:['보스 몬스터 데미지','보스 데미지']},
    {label:'일반 몬스터 데미지%',target:'normalDamage',keywords:['일반 몬스터 데미지']},
    {label:'크리티컬 확률%',target:'critRate',keywords:['크리티컬 확률','치명타 확률']},
    {label:'크리티컬 데미지%',target:'critDamage',keywords:['크리티컬 데미지','치명타 데미지']},
    {label:'방어 관통력%',target:'defPen',keywords:['방어 관통력','방어력 관통']},
    {label:'공격 속도%',target:'attackSpeed',keywords:['공격 속도']},
    {label:'최소 데미지 배율%',target:'minDamage',keywords:['최소 데미지 배율']},
    {label:'최대 데미지 배율%',target:'maxDamage',keywords:['최대 데미지 배율']}
  ];

  async function processFiles(files){
    if(!files||!files.length)return;
    if(typeof window.Tesseract==='undefined'){
      statusEl.textContent='Tesseract OCR 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도하세요.';
      return;
    }
    statusEl.textContent='OCR 분석 진행 중… 잠시만 기다려주세요.';
    pendingOcrStats={};
    resultsEl.innerHTML='';
    try{
      const worker=await window.Tesseract.createWorker('kor+eng');
      for(const file of files){
        const {data:{text}}=await worker.recognize(file);
        const lines=text.split('\n');
        for(const line of lines){
          for(const def of STAT_FIELD_MAP){
            for(const kw of def.keywords){
              if(line.includes(kw)){
                const match=line.match(/([0-9,]+(?:\.[0-9]+)?)/);
                if(match){
                  const val=Number(match[1].replace(/,/g,''));
                  if(Number.isFinite(val))pendingOcrStats[def.target]=val;
                }
              }
            }
          }
        }
      }
      await worker.terminate();
      const foundCount=Object.keys(pendingOcrStats).length;
      if(foundCount===0){
        statusEl.textContent='이미지에서 스탯 수치를 찾지 못했습니다. 글자가 선명한 스탯 팝업 스크린샷을 사용하세요.';
      }else{
        statusEl.textContent=`${foundCount}개의 스탯 항목을 감지했습니다. 수치 확인 후 적용을 누르세요.`;
        resultsEl.innerHTML=Object.entries(pendingOcrStats).map(([field,val])=>{
          const def=STAT_FIELD_MAP.find(d=>d.target===field);
          return `<div class="stat-row" style="border:1px solid var(--line);border-radius:8px;padding:6px;background:#fff;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;font-weight:700;">${def?.label||field}</span><input data-ocr-field="${field}" type="number" step="0.01" value="${val}" style="width:100px;padding:4px;border:1px solid var(--line);border-radius:6px;"></div>`;
        }).join('');
      }
    }catch(err){
      statusEl.textContent='OCR 처리 중 오류가 발생했습니다: '+err.message;
    }
  }

  function extractImageFiles(e){
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
          if (item.type.indexOf('image') === 0 || item.kind === 'file') {
            const blob = item.getAsFile();
            if (blob) list.push(blob);
          }
        }
      }
    }
    return list;
  }

  function handlePaste(e){
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
    statusEl.textContent = '클립보드 이미지를 읽는 중입니다. Ctrl+V 키를 누르시면 즉시 분석됩니다.';
  });

  runBtn?.addEventListener('click', () => processFiles(fileInput?.files));
  fileInput?.addEventListener('change', e => processFiles(e.target.files));
  applyBtn?.addEventListener('click', () => {
    resultsEl.querySelectorAll('[data-ocr-field]').forEach(input => {
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

function getContentIdFromStageTarget() {
  const mode = $('stageMode')?.value || 'hunt';
  const chapter = $('stageChapter')?.value || '';
  if (mode === 'hunt') return 'chapter-hunt';
  if (mode === 'trial') return 'chapter-trial';
  if (mode === 'boss_raid') return 'boss-raid';
  if (mode === 'world_boss') return 'world-boss';
  if (mode === 'growth_dungeon') {
    if (chapter.includes('무기')) return 'weapon-dungeon';
    if (chapter.includes('경험치')) return 'exp-dungeon';
    if (chapter.includes('장비')) return 'equipment-dungeon';
    if (chapter.includes('수련장')) return 'training-ground';
    if (chapter.includes('강화')) return 'enhancement-dungeon';
    return 'weapon-dungeon';
  }
  if (mode === 'guild_content') {
    if (chapter.includes('토벌')) return 'guild-battle';
    if (chapter.includes('대항전')) return 'guild-war';
    if (chapter.includes('자쿰')) return 'guild-raid-zakum';
    return 'guild-battle';
  }
  return 'chapter-hunt';
}

function syncContentPresetFromTarget() {
  const id = getContentIdFromStageTarget();
  if (window.MapleGrowthPresets?.activateContent) {
    window.MapleGrowthPresets.activateContent(id, { syncTarget: false });
  }
}

window.fillStageChapters = fillStageChapters;
window.fillStages = fillStages;

function bind(){initOcrModal();window.addEventListener('maple:presets-changed',()=>{renderCompanionEffect();renderAll()});document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.dataset.panel===btn.dataset.tab))}));document.querySelectorAll('#characterForm input,#characterForm select,#targetForm input,#targetForm select').forEach(el=>el.addEventListener('input',()=>{renderCompanionEffect();if(['stageMode','stageChapter'].includes(el.id)){if(el.id==='stageMode')fillStageChapters();else fillStages();syncContentPresetFromTarget();}else if(el.id==='stageSelect')applyStageTarget();renderCombat()}));$('calculateCombat').addEventListener('click',renderCombat);$('calculateCube').addEventListener('click',renderCube);$('cubeGrade').addEventListener('change',fillCubeSources);$('cubeEquipment').addEventListener('change',fillCubeSources);$('cubeSlot').addEventListener('change',fillCubeSources);$('cubeOptionSelect').addEventListener('change',()=>{setCubeProbability();renderCubeTargetSummary();});$('cubeGoalMode').addEventListener('change',renderCubeTargetSummary);['cubeGoal1','cubeGoal2','cubeGoal3'].forEach(id=>$(id).addEventListener('change',renderCubeTargetSummary));$('applyCubeOption').addEventListener('click',applySelectedCubeOption);$('calculateProbability').addEventListener('click',renderProbability);document.querySelectorAll('#currentOptions,#candidateOptions').forEach(el=>el.addEventListener('input',renderCube));$('saveQuick').addEventListener('click',()=>{saveLocal();$('activePresetLabel').textContent='현재 입력 저장됨';});$('resetAll').addEventListener('click',()=>{if(confirm('현재 입력을 초기화할까요?')){localStorage.removeItem(STORE);location.reload()}});$('savePreset').addEventListener('click',()=>{const name=$('presetName').value.trim();if(!name){alert('프리셋 이름을 입력하세요.');return}const p=profiles();p[name]=snapshot();saveProfiles(p);$('presetSelect').value=name;$('activePresetLabel').textContent=name;saveLocal()});$('loadPreset').addEventListener('click',()=>{const name=$('presetSelect').value,p=profiles();if(name&&p[name]){$('activePresetLabel').textContent=name;applySnapshot(p[name]);saveLocal()}});$('deletePreset').addEventListener('click',()=>{const name=$('presetSelect').value;if(!name)return;const p=profiles();delete p[name];saveProfiles(p);$('activePresetLabel').textContent='현재 입력'});}
renderOptionRows();renderProfileSelect();bind();loadData();renderAll();

