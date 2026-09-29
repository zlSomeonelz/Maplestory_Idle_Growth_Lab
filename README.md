# MapleStory Idle Growth Lab

메이플 키우기 성장·큐브 비교 계산기의 첫 번째 MVP입니다.

## 현재 기능

- 현재 잠재와 왼쪽·오른쪽 큐브 후보 입력
- 필수·우선·허용·제외 선호 옵션 설정
- 메소·큐브 예산 입력
- 현재 유지·왼쪽·오른쪽 후보의 방향성 비교
- 브라우저 localStorage 저장
- AI 분석용 Markdown 요약 복사
- 동료 보유 현황 OCR 보조 입력 페이지

## 동료 보유 현황 OCR

보유 현황 스크린샷에서 동료 레벨·보유 수량·보유 여부를 읽고, 이름 매핑을 확인한 뒤 브라우저에 저장합니다.

- 도구: https://zlsomeonelz.github.io/Maplestory_Idle_Growth_Lab/companion-ocr.html
- 초상화에는 이름 텍스트가 없으므로 이름은 첫 사용 시 위치별로 확인해야 합니다.
- OCR 결과는 게임 화면과 대조한 뒤 사용하세요.

## GitHub Pages

정적 HTML 사이트로 배포됩니다. Pages 설정에서 GitHub Actions를 소스로 선택한 뒤 main 브랜치에 변경이 생기면 자동 배포됩니다.

확률·비용을 모르는 값은 임의로 계산하지 않습니다.
