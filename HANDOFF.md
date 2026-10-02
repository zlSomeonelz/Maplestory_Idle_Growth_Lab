# MapleStory Idle Growth Lab — Antigravity 인수인계 문서

> 이 문서는 Antigravity 또는 다른 개발 에이전트가 저장소를 바로 이어받을 수 있도록 현재 구현된 계산 알고리즘, 데이터 구조, 검증 상태, 남은 작업을 정리한 문서다.
>
> 기준 커밋: `d18e6d46768f5a841c07721d29e14dfa5c042f13`  
> 저장소: <https://github.com/zlSomeonelz/Maplestory_Idle_Growth_Lab>  
> 공개 사이트: <https://zlsomeonelz.github.io/Maplestory_Idle_Growth_Lab/>

## 1. 프로젝트 목적

메이플 키우기의 공식 전투 규칙과 넥슨 나우 공시 확률을 코드로 계산하는 iPad 친화적 정적 웹 계산기다.

핵심 원칙:

- AI가 매번 계산하지 않고 브라우저의 순수 JavaScript 수식 엔진에서 계산한다.
- 공식 원문에 없는 값은 확정하지 않는다.
- 공시 확률에서는 `settingPercent`만 사용하고 `actualResult`는 기댓값 계산에서 제외한다.
- 전투력과 DPS는 서로 다른 지표다. 전투력은 성장 비교용이고 실제 전투 결과를 그대로 의미하지 않는다.
- 직업 스탯 데이터와 외부 클라이언트에서 추출한 동료 데이터는 검증 상태를 분리한다.

공식 기준:

1. [메이플 키우기 공식 전투 시스템 안내](https://maplestoryidle.nexon.com/ko/guide#gnbAllLayer)
2. [넥슨 나우 공시 확률](https://now.nexon.com/service/maplestoryidle?page=bd75db0f-1352-4401-9457-be38041bfeac)

## 2. 실행·검증 방법

저장소는 빌드 도구 없는 정적 사이트다.

```bash
node tests/engine.test.mjs
```

간단한 로컬 실행:

```bash
python3 -m http.server 8000
# 브라우저에서 http://127.0.0.1:8000/ 접속
```

수정 후 최소 검증:

```bash
node --input-type=module --check < app.js
node --check engine.mjs
node tests/engine.test.mjs
```

주의:

- `app.js`는 ES module이므로 일반적인 CommonJS `new Function()` 검사로 검사하지 않는다.
- JSON을 수정했다면 `python3 -m json.tool data/<file>.json` 또는 `JSON.parse`로 유효성을 확인한다.
- GitHub Pages는 별도 빌드 없이 정적 파일을 배포한다.

## 3. 파일 구조와 책임

### 핵심 코드

- `index.html`
  - 앱 셸
  - 전투 계산, 큐브 비교, 확률·기댓값 탭
  - 캐릭터·콘텐츠·PvP·큐브 입력 UI
- `app.js`
  - DOM 입력 수집
  - 프리셋/localStorage
  - 데이터 JSON 로딩
  - 직업별 주·부 스탯 매핑
  - 공식 큐브 확률표 선택 UI
  - `engine.mjs` 호출과 결과 렌더링
- `engine.mjs`
  - UI와 분리된 순수 함수
  - `calculateDamage`
  - `calculateDps`
  - `calculateCombatPower`
  - `calculatePvpDamage`
  - `cubeTargetSummary`
  - `probabilitySummary`
- `tests/engine.test.mjs`
  - PvE 피해·DPS
  - 점감 능력치
  - 스탯 비례 데미지
  - 전투력
  - PvP
  - 큐브 단일·복수 목표 확률
  - 일반 확률 기댓값 회귀 테스트
- `styles.css`
  - 반응형 iPad·모바일 스타일

### 데이터

- `data/combat-rules.json`
  - 공식 전투 계산 순서
  - 상한·점감 규칙
  - PvP 상수·레벨 보정
  - 전투력 기본식·가중치
  - 동료 계산 경계
- `data/stat-rules.json`
  - 능력치 합산·곱연산·점감·적용 범위
- `data/job-stats.json`
  - 직업별 주·부 스탯 매핑
  - 현재 `status: provisional`
  - 본가 커뮤니티 참고값이며 메이플 키우기 공식 자료로 최종 검증되지 않음
- `data/probabilities.json`
  - 기존 공시 확률 데이터
- `data/potential-probabilities.json`
  - 큐브/잠재 옵션 확률
  - 등급·장비·슬롯별 `settingPercent`
  - `actualResult`는 사용하지 않음
- `data/stage-data.json`
  - 챕터 사냥·도전 스테이지 적 HP·방어력
- `data/companion-runtime-data.json`
  - 외부 클라이언트에서 확인한 동료 장착 효과 원시 데이터
- `data/companion-rules.json`
  - 동료 효과의 적용 경계와 조건부 효과 보류 규칙
- `data/community-companion-guide.json`
  - 동료 관련 커뮤니티 자료

### 보조 페이지

- `companion-ocr.html`
- `companion-templates.js`
- `companion-visual-templates.js`
- `preset-ocr.html`
- `stat-ocr.html`

OCR 관련 코드는 존재하지만 메인 계산 흐름에 완전히 통합된 기능으로 취급하지 않는다. OCR 결과는 사용자가 검토한 뒤 계산에 사용해야 한다.

## 4. 단위와 공통 변환

UI는 사람이 읽는 표시 퍼센트를 사용한다.

- 화면의 `20` = 20%
- 공식 내부 분율의 `200`
- 공식 배율 = `(1000 + 내부값) / 1000`

`engine.mjs`의 `pct(value)`:

```js
1 + value / 100
```

전투력 식에서는 UI 표시 퍼센트를 공식 내부값으로 바꾼다.

```js
permille(displayPercent) = displayPercent * 10
```

예:

- 데미지 50% → 내부값 500
- 공격 속도 100% → 내부값 1000
- 최소 데미지 65% → 내부값 650
- 최대 데미지 100% → 내부값 1000

## 5. 현재 구현된 알고리즘

### 5.1 PvE 1회 피해

`calculateDamage(s, rules)`가 담당한다.

입력은 화면 표시 단위다.

1. 공격력

```text
attack = attackFlat × (1 + attackPct / 100)
```

2. 방어 관통 점감

- 방어 관통력 상한은 공식 데이터의 100%
- 기본값과 추가 옵션을 남은 상한에 누적
- 현재 구현은 `diminishingSum`으로 처리

```text
effective = cap - (cap - current) × (1 - additional / cap)
```

3. 적 방어력

```text
afterDefense = targetDefense × (1 - effectiveDefPen / 100)

if targetDefense > 0:
  defenseFactor = 5000 / (afterDefense + 6000)
else:
  defenseFactor = 1
```

4. 대상 보정

- 대상이 `boss`이면 보스 데미지만 사용
- 대상이 `normal`이면 일반 몬스터 데미지만 사용
- PvP에서는 보스/일반 몬스터 데미지를 사용하지 않음

5. 주요 배율

현재 구현은 다음을 곱한다.

```text
attack
× defenseFactor
× targetTaken
× damage
× damageAmp
× bossOrNormalDamage
× (basicDamage + skillDamage)
× statBasedDamage
× mastery
× criticalExpectedMultiplier
× minMaxRangeMultiplier
× finalDamage
× skillCoefficient
× accuracyFactor
```

화면 퍼센트 `x`는 각 단계에서 `1 + x / 100`으로 변환된다.

6. 스탯 비례 데미지

직업별 합산 스탯을 직접 입력하는 모드에서는:

```text
statBasedDamage = mainStat / 100 + subStat / 400
```

즉:

- 주스탯 100당 1%
- 부스탯 400당 1%

이 값은 이미 표시 퍼센트이므로 엔진에서 다시 100배 하지 않는다. 과거에 이 부분이 100배 잘못 적용되던 문제를 현재 수정했다.

7. 크리티컬 기대값

```text
critChance = clamp(critRate / 100, 0, 1)
critFactor = 1 + critChance × (critDamage / 100)
```

8. 최소·최대 데미지

```text
min = minDamage / 100  // 0 이하이면 1
max = maxDamage / 100  // 0 이하이면 1
rangeFactor = (min + max(max, min)) / 2
```

### 5.2 DPS

`calculateDps(averageDamage, s, rules)`가 담당한다.

현재 공식 공격 행동·스킬별 실제 행동 간격 표가 코드화되지 않았기 때문에 상대 비교용 provisional 계산이다.

```text
effectiveAttackSpeed = diminishingSum(attackSpeed, additions, 150%)
speedFactor = 1 + effectiveAttackSpeed / 100
DPS = averageDamage × speedFactor / attackInterval
```

결과에는 다음을 함께 반환한다.

- `dps`
- `effectiveAttackSpeed`
- `speedFactor`
- `interval`
- `provisional: true`

공식 부록의 “스킬이 정상 종료된 경우 초과 시간이 다음 사용에 이어진다”는 규칙은 데이터에 기록되어 있지만, 스킬별 액션 시뮬레이터는 아직 없다.

### 5.3 전투력

`calculateCombatPower(s, rules)`가 담당한다.

기본값:

```text
base = attack × 3 + maxHp × 0.05 + defense × 0.2
```

이후 공식 내부값과 `1,000,000` 기준으로 여러 보정 배율을 순차 적용한다.

현재 구현된 보정 그룹:

```text
HP·방어력·MP
데미지
공격 속도
크리티컬 확률·크리티컬 데미지
최소·최대 데미지 배율
명중·회피
일반·보스 몬스터 데미지
상태이상 데미지
스킬·기본 공격 데미지
방어 관통력
직업별 스킬 레벨
버프 지속시간
동료 소환 지속시간
고정·% 쿨타임 감소
기본 공격 대상 수
받는 피해 감소
스탯 비례 데미지
최종 데미지
데미지 증폭
주스탯·부스탯 마스터리
```

중요한 변환:

- 크리티컬 데미지는 공식 기본값 300을 포함해 `300 + displayPercent × 10`
- 최소 데미지 기본값 650
- 최대 데미지 기본값 1000
- 최대 MP 기본 기준값 500
- `mainMasteryCount`, `subMasteryCount`는 각각 80,000·25,000 가중치로 추상화

전투력 결과에는 다음이 포함된다.

- `power`
- `base`
- 각 보정 그룹의 `raw`, `factor`
- `missingInputs`
- `provisional`

### 5.4 PvP

`calculatePvpDamage(s, rules)`가 담당한다.

지원 콘텐츠:

- `arena`
- `worldArena`
- `colosseum`

전체 구조:

```text
기본 전투 공식에서 스킬 계수 제외
→ 제곱근
→ 스킬 계수
→ 콘텐츠별 레벨 보정
→ PvP 피해량 보정
→ ×2
```

PvP 방어 보정에는 다음을 사용한다.

- 공격력
- 방어 관통력
- 데미지
- 데미지 증폭
- 기본 공격·스킬 데미지 평균
- 스탯 비례 데미지
- 크리티컬 데미지와 크리티컬 확률
- 최소·최대 데미지 평균
- 최종 데미지
- 대상 최대 HP
- 대상 방어력
- 대상 받는 피해 감소

UI에서는 다음 방어자 입력을 사용한다.

- `targetHp`
- `targetDefense`
- `targetReceivedDamageReduction`

콘텐츠별 공식 상수와 레벨 보정 구간은 `data/combat-rules.json`에 저장되어 있다.

현재 PvP에서 아직 모델링하지 않는 것:

- 스킬별 예외
- 특수 피해·즉사·최대 HP 비례 특수 패턴
- 콘텐츠별 명중·회피 예외
- 실제 PvP 스킬 행동 주기
- 전투 중 버프·액티브 변화

### 5.5 직업별 주·부 스탯

`data/job-stats.json`의 매핑을 사용한다.

두 모드가 있다.

1. `aggregate`
   - 사용자가 주스탯·부스탯 합산값을 직접 입력
   - 기존 프리셋과 호환되는 기본 모드
2. `job`
   - STR/DEX/INT/LUK 원시값을 입력
   - 선택한 직업의 `main`, `sub` 배열에 따라 자동 합산

예:

```text
히어로: STR main, DEX sub
아크메이지: INT main, LUK sub
보우마스터: DEX main, STR sub
나이트로드: LUK main, DEX sub
```

현재 매핑은 `provisional`이다. 공식 메이플 키우기 직업별 자료와 대조되기 전에는 확정값으로 바꾸지 않는다.

### 5.6 큐브 옵션 비교

`app.js`가 `potential-probabilities.json`을 로드한다.

선택 흐름:

1. 등급 선택
2. 장비 선택
3. 슬롯 선택
4. 공식 옵션 선택
5. 설정 확률 자동 반영
6. 선택 옵션을 후보 1번 슬롯에 적용
7. 현재 옵션과 후보 옵션을 같은 전투 엔진으로 계산

옵션 라벨은 `parseCubeOption()`이 내부 코드로 변환한다.

예:

```text
크리티컬 확률 6% → CRIT_RATE = 6
공격 속도 4% → ATK_SPEED = 4
데미지 12% → DMG = 12
STR 200 → MAIN_STAT_FLAT 또는 SUB_STAT_FLAT
STR 6% → MAIN_STAT_PCT 또는 SUB_STAT_PCT
스킬 재사용 대기시간 감소 0.5초 → FIXED_CDR = 0.5
```

직업의 주·부 매핑에 따라 STR/DEX/INT/LUK 옵션의 적용 대상을 구분한다.

### 5.7 큐브 목표 확률·기댓값

`cubeTargetSummary(slotOptions, goals, mode, cost)`가 담당한다.

목표 조건:

- `any`: 목표 옵션 중 하나 이상
- `all`: 선택한 목표 옵션 모두

현재는 슬롯별 설정 확률을 독립 시행으로 간주한다.

`any`:

```text
P(any) = 1 - Π(1 - slotTargetProbability)
```

`all`:

- 슬롯을 순회하며 목표 옵션 획득 상태를 비트마스크 DP로 계산
- 한 슬롯에서는 목표 옵션 중 하나 또는 기타 결과가 나온다고 가정
- 모든 목표 비트가 켜지는 확률을 반환

기댓값:

```text
expectedAttempts = 1 / successProbability
expectedCost = expectedAttempts × cubeCost
```

목표 옵션은 최대 3개까지 UI에서 선택할 수 있다.

### 5.8 일반 확률 계산

`probabilitySummary(ratePercent, attempts, cost)`가 담당한다.

```text
p = successRate / 100
P(at least one success in n tries) = 1 - (1 - p)^n
expectedAttempts = 1 / p
expectedCost = expectedAttempts × cost
```

90%·95% 달성 필요 횟수도 계산한다.

### 5.9 저장·프리셋

- 현재 입력은 `localStorage`에 저장
- 이름별 프리셋은 별도 localStorage 키에 저장
- 모든 `input[id]`, `select[id]`를 자동 스냅샷
- 새 입력 필드를 추가하면 자동으로 프리셋에 포함된다.

## 6. 현재 검증 상태

최근 검증된 항목:

- `node tests/engine.test.mjs` 통과
- `app.js` ES module 문법 검사 통과
- `engine.mjs` 문법 검사 통과
- `combat-rules.json` 유효성 검사 통과
- `potential-probabilities.json` 유효성 검사 통과
- 1024×1366 브라우저 smoke test 통과
- PvE·DPS·전투력·PvP·큐브 단일 목표·큐브 복수 목표 회귀 테스트 통과

GitHub Pages는 정적 배포이며, 공개 페이지가 커밋 직후 바로 갱신되지 않을 수 있다. 배포가 의심되면 커밋 SHA와 공개 사이트의 캐시를 따로 확인한다.

## 7. 남은 작업 — 우선순위

### P0. 큐브 재설정 규칙 정확화 [완료]

넥슨 나우 공시 규칙(“기존 옵션과 3슬롯의 종류·수치·순서가 모두 같으면 다른 결과가 나올 때까지 재설정”)에 맞추어 3슬롯 상태 공간 기반 재설정 확률 보정 모델을 구현 완료했다 (`engine.mjs`의 `cubeTargetSummary` 및 `tests/engine.test.mjs` 검증 통과).

- 기존 옵션 동일 결과 제거 및 $P_{reroll} = \frac{P_{target} - P_{same}}{1 - P_{same}}$ (목표 포함 시) / $\frac{P_{target}}{1 - P_{same}}$ (목표 미포함 시) 수식 적용
- UI 렌더링에 재설정 규칙 설명 및 동일 옵션 등장 확률 표기 추가

### P1. 큐브 옵션 효과의 완전한 전투력·DPS 연결 [완료]

모든 큐브/잠재 옵션 타입(`MIN_DAMAGE`, `MAX_DAMAGE`, `MAX_HP`, `PLAYER_DEFENSE`, `MAX_MP`, `FIXED_CDR`, `COOLDOWN_PCT`, `BUFF_DURATION`, `COMPANION_DURATION`, `TARGET_COUNT_INC`, `ALL_SKILL_LEVEL` 등)을 `parseCubeOption` 및 `readInputs(extra)` 매핑에 100% 연결 완료했습니다.

- `calculatePower(extra)`를 구현하여 큐브 옵션 적용 전후의 공식 전투력(Combat Power) 변화량 및 변화율을 계산
- UI 결과 카드에 **DPS 비교**와 **전투력 비교**를 나란히 표시하여, 최대 HP/방어력/MP/쿨감 등 DPS에 직접 반영되지 않는 유틸·생존 옵션의 가치도 전투력 변화로 명확히 파악 가능하도록 개선 완료

### P1. 공식 DPS 행동 모델

현재 DPS는 공격 속도를 `1 + effectiveAttackSpeed / 100`으로 환산하는 provisional 모델이다.

필요 작업:

- 직업·스킬별 기본 공격 간격 데이터 확보
- 공격 속도와 액션 진행 속도의 실제 관계 확인
- 스킬 시전 시간·쿨타임·연계 지연 모델링
- 정상 종료 시 초과 시간 이월
- 취소 시 초과 시간 미이월
- 동료 소환 주기와 조건부 스킬 반영
- 단일 대상·다중 대상 DPS 분리

### P1. 직업 스탯 공식 검증

`data/job-stats.json`은 아직 provisional이다.

필요 작업:

- 공식 메이플 키우기 자료에서 직업별 주·부 스탯 확인
- 섀도어의 legacy reference 처리
- 특수 직업·하이브리드 직업의 예외 처리
- 검증 날짜와 공식 출처 기록
- 검증 전까지 provisional 표시 유지

### P2. PvP 완성도 향상

현재 기본 PvP 보정은 구현되어 있다.

남은 작업:

- 명중·회피 실제 PvP 적용 여부 확인
- 방어자 크리티컬 저항 처리
- 콘텐츠별 스킬 예외
- 특수 피해·즉사·최대 HP 비례 피해
- 전투 시작 전 스탯 스냅샷
- PvP 전용 입력 패널 분리
- PvP 방어 보정 중간값 디버그 표시

### P2. 동료 전투 모델

현재는 검증된 동료 장착 효과만 일반 능력치에 반영한다.

보류 항목:

- 동료 자체 공격
- 조건부 스킬
- 소환 주기
- 공격력 계승 비율의 레벨·전직 단계 세부식
- 소환 시점 스냅샷
- 동료 DPS와 플레이어 DPS 분리

### P2. OCR 통합

OCR 관련 페이지와 캐시는 존재한다.

남은 작업:

- OCR 결과를 검토 가능한 편집 폼으로 표시
- 사용자가 승인한 값만 현재 프리셋에 반영
- 주스탯·부스탯·공격력·HP·방어력 라벨 검증
- 부분 OCR 결과가 전체 값을 덮어쓰지 않도록 유지
- iPad Safari 카메라·클립보드 입력 검증

### P2. UI·배포 품질

- iPad Safari 실제 입력 테스트
- 가로·세로 화면 테스트
- 작은 화면에서 보조 입력 영역 접기·스크롤 개선
- 데이터 로딩 실패 시 파일별 오류 표시
- 공식 데이터 업데이트 시 갱신일 자동 표시
- GitHub Pages 배포 smoke test 자동화
- JSON 대형 파일 로딩 비용 측정

## 8. 작업 시 지켜야 할 규칙

- PAT, 개인 토큰, 비밀값을 요청하거나 출력하지 않는다.
- 공식 원문에 없는 수치를 임의로 확정하지 않는다.
- 새 임시 수치는 `provisional` 또는 `unverified`로 표시한다.
- `actualResult`를 확률 기댓값에 사용하지 않는다.
- 보스/일반 몬스터 데미지는 대상에 따라 하나만 적용한다.
- 최종 데미지·점감 능력치·콘텐츠 보정의 적용 순서를 임의로 바꾸지 않는다.
- 동료 조건부 효과는 발동 조건과 주기를 확인하기 전까지 자동 합산하지 않는다.
- 새 계산식을 추가하면 `engine.mjs`에 순수 함수로 두고 회귀 테스트를 먼저 추가한다.
- 화면에서 계산하지 말고 엔진 함수가 반환한 값을 화면에 렌더링한다.
- 기존 localStorage 프리셋이 깨지지 않도록 새 필드에는 안전한 기본값을 둔다.
- 대형 JSON을 수정할 때는 전체 파일을 무분별하게 재정렬하지 않는다.

## 9. Antigravity 시작 체크리스트

1. 저장소를 최신 `main`으로 동기화한다.
2. 이 문서와 `README.md`를 먼저 읽는다.
3. `data/combat-rules.json`, `data/stat-rules.json`, `data/job-stats.json`을 확인한다.
4. `node tests/engine.test.mjs`를 실행한다.
5. 정적 서버로 화면을 열어 전투력·DPS·PvP·큐브 탭을 확인한다.
6. 계산식 변경 전 공식 출처와 현재 단위를 확인한다.
7. 엔진 테스트를 추가한 뒤 UI를 수정한다.
8. UI smoke test와 JSON 검증 후 커밋한다.
9. 한 커밋에는 한 기능 단위만 넣고, 커밋 메시지에 기능을 명시한다.

## 10. 권장 다음 커밋

가장 먼저 할 작업:

```text
Implement exact three-slot cube reroll-state probability model
```

완료 조건:

- 3슬롯 전체 결과 조합 상태 정의
- 기존 조합과 동일한 결과 제외
- 목표 옵션 any/all 계산
- 설정 확률 기준과 재설정 규칙의 차이를 UI에 표시
- 기존 독립 슬롯 기대값과 결과 비교 테스트 추가
