# MapleStory Idle Growth Lab

메이플 키우기 공식 전투 규칙과 공시 확률을 기준으로 계산하는 iPad 친화적 정적 웹 계산기입니다.

## MVP 1.0

- 캐릭터 프리셋: 직업, 레벨, 공격력, 주·부스탯, 피해 관련 능력치
- 공식 규칙 기반 PvE 평균 피해·예상 DPS 계산
- 보스/일반 몬스터와 방어력·방어 관통력 반영
- 현재 프리셋에 큐브 옵션 변화를 적용한 전후 비교
- 설정 확률 기반 목표 달성 확률·기대 시도 횟수·기대 비용
- 브라우저 localStorage 기반 현재 입력 저장과 이름별 프리셋
- `provisional` / `unverified` 상태 표시

## 구조

- `index.html`: 앱 셸과 3개 핵심 탭
- `app.js`: 입력 상태, 프리셋, 전투·큐브·확률 계산 엔진
- `styles.css`: 반응형 iPad·모바일 UI
- `data/combat-rules.json`: 공식 전투 규칙 요약
- `data/stat-rules.json`: 능력치 합산·곱연산·상한 규칙
- `data/job-stats.json`: 공식 대조 전 임시 직업 주·부 스탯 매핑
- `data/probabilities.json`: 넥슨 나우 설정 확률 데이터

계산은 AI 호출이 아니라 브라우저 수식 엔진에서 수행합니다. 저장소에 없는 공식 수치나 스킬 계수는 임의로 확정하지 않습니다.

## 공식 기준

1. [메이플 키우기 공식 전투 시스템 안내](https://maplestoryidle.nexon.com/ko/guide#gnbAllLayer)
2. [넥슨 나우 공시 확률](https://now.nexon.com/service/maplestoryidle?page=bd75db0f-1352-4401-9457-be38041bfeac)

## 배포

GitHub Pages 정적 사이트입니다.

- 저장소: https://github.com/zlSomeonelz/Maplestory_Idle_Growth_Lab
- 사이트: https://zlsomeonelz.github.io/Maplestory_Idle_Growth_Lab/
