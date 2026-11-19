# Sales2AX — 영업2팀 AX 챌린지 웹

> 이 폴더에서 일할 때 적용. 전역 지침(`~/.claude/CLAUDE.md`)과 `KORTEK\CLAUDE.md`도 함께 지킨다.

## 1. 무슨 프로젝트인가
- **배경**: 황성희 팀장 지시(2026-11-17, Outlook "AI 교육 건") — 영업2팀 대상 매주 1시간 AI 교육 커리큘럼. 진행자는 박혜근(Rodrigo).
- **참여 팀원**: Dave, Ethan, Rodrigo, Sumin (4명, 2026-11-19 사용자 지정 — Alex·HyeRim·Eric 제외)
- **성격**: 강의형 교육이 아니라 **4주 챌린지**. 팀원 각자 자기 반복 업무 하나를 골라 AI(바이브 코딩)로 자동화하고, 4주차에 MVP를 발표한다.
- **이 웹의 역할**: 챌린지 진행 관리 도구.
  1. 팀원: AI 에이전트에 정해진 프롬프트를 넣어 진행 상황을 약속된 형식으로 받고 → 붙여넣어 보고
  2. 팀장: 요약 페이지에서 팀원별 과제·AX 방향·단계·진척도·예상 월 단축 시간을 한눈에 확인
- **커리큘럼 원본**: 볼트 `05_업무지시/2026-11-17/2026-11-17 AI 교육 커리큘럼 보고 (팀장 지시).md` (일정을 바꾸면 이 노트와 `js/app.js`의 `WEEKS`를 같이 고친다)
- **교육 자료**: `KORTEK\AX\AI 기초와 바이브 코딩.html`(1주차 교육), `KORTEK\AX\AI 업무 활용 사례.html`(사례 시연·업무 환경 셋업 부록)

## 2. 4주 일정
| 주차 | 내용 |
|---|---|
| 1 | 기본 교육 + 주제 선정 과제 |
| 2 | 주제 발표 + 진행자 대표 빌드 시연 (도구 개론: GitHub, Firebase, VBA, Python, AHK — 고르기 어려운 건 AI에게 묻는 요청 구체화법) |
| 3 | 중간점검 (진행 시연, 막힌 점 공동 피드백) |
| 4 | MVP 결과 발표 |

## 3. 구조
- 배포: GitHub Pages https://hgpark27-alt.github.io/Sales2AX/ (`main` 브랜치 push → 자동 배포)
- 화면(한 페이지, 주소 끝으로 구분): `#/` 챌린지 홈, `#/m/<id>` 팀원 보고, `#/summary` 팀장 요약
- 저장: Firebase 프로젝트 `sales2ax-hg27`, Firestore `reports` 컬렉션(위치 nam5). 보고는 쌓이기만 하고 수정·삭제 불가
- 파일
  - `js/parse.js` — 보고 형식(`FIELDS`), 붙여넣은 글 해석, 프롬프트 생성, 월 단축 시간 계산
  - `js/app.js` — 화면 3개, 팀원 명단(`MEMBERS`), 일정(`WEEKS`)
  - `js/store.js` — Firestore 읽기·저장, `js/firebase-config.js` — 웹 설정(공개 값)
  - `firestore.rules` — 보안 규칙(팀원 명단·항목·글자 수 검사)
  - `test/parse.test.mjs` — 해석기 테스트

## 4. 작업 규칙
1. 보고 형식(칸)을 바꾸면 `FIELDS` → `firestore.rules`의 허용 항목 → 테스트를 같이 고친다.
2. 팀원을 바꾸면 `MEMBERS`와 `firestore.rules` 명단을 같이 고치고 `firebase deploy --only firestore:rules`.
3. 검증: `node --test test/` 통과 + 화면은 로컬 서버(모듈 스크립트라 file:// 불가)로 Edge 헤드리스 확인 → push 후 배포 주소에서 다시 확인.
4. 실제 Firebase에 시험 저장했으면 반드시 지운다 (`firebase firestore:delete reports/<id> --force`). 팀원이 보는 공개 페이지다.
5. 공개 주소·로그인 없음 → 고객사 이름·단가·개인 정보가 들어가는 기능은 만들지 않는다.
6. 디자인: 기존 교육 자료와 같은 밝은 회색 배경 + 흰 패널 + pill. 다크 테마·그라디언트·이모지 금지.
