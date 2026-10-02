# MapleStory Idle Growth Lab

메이플 키우기 공식 전투 규칙과 공시 확률을 기준으로 계산하는 iPad 친화적 정적 웹 계산기입니다.

## MVP 1.0

- 캐릭터 프리셋: 직업, 레벨, 공격력, 주·부스탯, 피해 관련 능력치
- 공식 규칙 기반 PvE 평균 피해·예상 DPS 계산
- 공식 전투력 계산식과 전투력 보조 능력치 입력
- 아레나·월드 아레나·콜로세움 PvP 피해 보정 및 레벨 보정
- 직업별 주·부 스탯 매핑 및 원시 스탯 기반 자동 합산(provisional)
- 직업·등급·레벨별 검증된 동료 장착 효과 반영(조건부 동료 스킬·자체 공격은 별도 보류)
- 보스/일반 몬스터와 방어력·방어 관통력 반영
- 현재 프리셋에 큐브 옵션 변화를 적용한 전후 비교
- 3개 옵션 슬롯 기준 단일·복수 목표 옵션 등장 확률·기대 큐브 횟수·기대 비용
- 설정 확률 기반 목표 달성 확률·기대 시도 횟수·기대 비용
- 브라우저 localStorage 기반 현재 입력 저장과 이름별 프리셋
- `provisional` / `unverified` 상태 표시

## 구조

- `index.html`: 앱 셸과 3개 핵심 탭
- `app.js`: 입력 상태, 프리셋, 화면 렌더링
- `engine.mjs`: UI와 분리된 순수 전투력·피해·DPS·확률 계산 엔진
- `tests/engine.test.mjs`: 기준 사례 회귀 테스트
- `styles.css`: 반응형 iPad·모바일 UI
- `data/combat-rules.json`: 공식 전투 규칙 요약
- `data/stat-rules.json`: 능력치 합산·곱연산·상한 규칙
- `data/job-stats.json`: 공식 대조 전 임시 직업 주·부 스탯 매핑
- `data/probabilities.json`: 넥슨 나우 설정 확률 데이터
- `data/companion-runtime-data.json`: 외부 클라이언트에서 확인한 동료 장착·스킬 원시 데이터
- `data/companion-rules.json`: 동료 계산 경계와 조건부 효과 처리 규칙
- `data/stage-data.json`: 챕터 사냥·도전 스테이지의 적 HP·방어력 데이터

계산은 AI 호출이 아니라 브라우저 수식 엔진에서 수행합니다. `node tests/engine.test.mjs`로 핵심 공식의 기준 사례를 검증할 수 있습니다. 저장소에 없는 공식 수치나 스킬 계수는 임의로 확정하지 않습니다.

## 공식 기준

1. [메이플 키우기 공식 전투 시스템 안내](https://maplestoryidle.nexon.com/ko/guide#gnbAllLayer)
2. [넥슨 나우 공시 확률](https://now.nexon.com/service/maplestoryidle?page=bd75db0f-1352-4401-9457-be38041bfeac)

## 배포

GitHub Pages 정적 사이트입니다.

- 저장소: https://github.com/zlSomeonelz/Maplestory_Idle_Growth_Lab
- 사이트: https://zlsomeonelz.github.io/Maplestory_Idle_Growth_Lab/
## 인수인계

계산 알고리즘, 데이터 상태, 검증 방법, 남은 작업은 [`HANDOFF.md`](HANDOFF.md)에 정리되어 있습니다.
