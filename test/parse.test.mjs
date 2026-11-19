// 실행: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport, monthlySavedHours, buildPrompt } from "../js/parse.js";

const SAMPLE = `[AX 챌린지 보고]
과제명: OPO 자동 갱신
대상 업무: 선적 메일 보고 OPO 엑셀 갱신
현재 방식: 메일을 하나씩 열어 손으로 입력
목표 방식: 메일을 읽어 바꿀 칸을 표로 제안
AX 방향: 기준 정리 후 자동화
사용 도구: PowerShell, HTML
현재 단계: 검증
진척도(%): 70
현재 소요 시간(1회, 분): 90
예상 소요 시간(1회, 분): 15
반복 주기: 매주
이번에 한 것: 35건 메일로 시험
막힌 점: PDF 글자 인식이 가끔 틀림
다음 할 것: 원본 대조 검사 추가
[끝]`;

test("약속된 형식을 칸별로 읽는다", () => {
  const r = parseReport(SAMPLE);
  assert.equal(r.title, "OPO 자동 갱신");
  assert.equal(r.task, "선적 메일 보고 OPO 엑셀 갱신");
  assert.equal(r.direction, "기준 정리 후 자동화");
  assert.equal(r.stage, "검증");
  assert.equal(r.progress, 70);
  assert.equal(r.minNow, 90);
  assert.equal(r.minAfter, 15);
  assert.equal(r.cycle, "매주");
  assert.equal(r.blocked, "PDF 글자 인식이 가끔 틀림");
});

test("마크다운 꾸밈·전각 콜론·코드 블록이 섞여도 읽는다", () => {
  const md = "```\n- **과제명**： 견적 비교표\n* 진척도(%): 40 %\n- 현재 단계: 첫 버전\n```";
  const r = parseReport(md);
  assert.equal(r.title, "견적 비교표");
  assert.equal(r.progress, 40);
  assert.equal(r.stage, "첫 버전");
});

test("여러 줄 값은 다음 칸이 나올 때까지 이어 붙인다", () => {
  const r = parseReport("이번에 한 것: 첫째\n둘째 줄\n막힌 점: 없음");
  assert.equal(r.done, "첫째\n둘째 줄");
  assert.equal(r.blocked, "없음");
});

test("선택지는 비슷한 표현도 정해진 값으로 맞추고, 범위 밖 숫자는 자른다", () => {
  const r = parseReport("AX 방향: 완전자동화\n현재 단계: 실무적용 중\n진척도: 130\n반복 주기: 매일(평일)");
  assert.equal(r.direction, "완전 자동화");
  assert.equal(r.stage, "실무 적용");
  assert.equal(r.progress, 100);
  assert.equal(r.cycle, "매일");
});

test("없는 칸은 빈 값, 엉뚱한 글은 무시한다", () => {
  const r = parseReport("안녕하세요. 정리해 드리겠습니다.\n과제명: A");
  assert.equal(r.title, "A");
  assert.equal(r.task, "");
  assert.equal(r.progress, null);
});

test("월 단축 시간 = (현재-예상) × 월 횟수 ÷ 60", () => {
  assert.equal(monthlySavedHours({ minNow: 90, minAfter: 15, cycle: "매주" }), 5);
  assert.equal(monthlySavedHours({ minNow: 30, minAfter: 0, cycle: "매일" }), 10);
  assert.equal(monthlySavedHours({ minNow: 60, minAfter: 20, cycle: "매월" }), 40 / 60);
  assert.equal(monthlySavedHours({ minNow: null, minAfter: 15, cycle: "매주" }), null);
  assert.equal(monthlySavedHours({ minNow: 10, minAfter: 20, cycle: "매주" }), 0);
});

test("프롬프트는 현재 세션에서 확인된 내용만 쓰게 하고, 그대로 붙여넣어도 형식이 읽힌다", () => {
  const p = buildPrompt();
  assert.match(p, /이 대화\(현재 세션\)/);
  assert.match(p, /이전 대화/);
  // 빈 형식만 붙여넣으면 아무 칸도 채우지 않아야 함 (지난 보고 값 유지)
  const r = parseReport(p);
  assert.equal(r.title, "");
  assert.equal(r.direction, "");
  assert.equal(r.stage, "");
  assert.equal(r.cycle, "");
  assert.equal(r.progress, null);
});
