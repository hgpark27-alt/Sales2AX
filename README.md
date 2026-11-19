# 영업2팀 AX 챌린지

4주 AI 교육 동안 팀원별 자동화 과제 진행 상황을 모으고, 팀장 요약 페이지에서 한눈에 보는 웹.

- 주소: https://hgpark27-alt.github.io/Sales2AX/
- 화면: `#/` 챌린지(일정·팀원), `#/m/<id>` 팀원 보고, `#/summary` 팀장 요약
- 저장: Firebase Firestore `reports` 컬렉션 (프로젝트 `sales2ax-hg27`), 규칙은 `firestore.rules`
- 보고 형식: `js/parse.js`의 `FIELDS` (프롬프트도 여기서 자동 생성)
- 팀원 바꾸기: `js/app.js`의 `MEMBERS`와 `firestore.rules`의 팀원 목록을 함께 수정 → `firebase deploy --only firestore:rules`
- 테스트: `node --test test/`
