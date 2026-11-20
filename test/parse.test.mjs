// 실행: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReport, monthlySavedHours, buildPrompt, normStage, stageIndex, firstMinNow, emptyFields } from "../js/parse.js";

const SAMPLE = `[AX 챌린지 보고]
과제명: OPO 자동 갱신
대상 업무: 선적 메일 보고 OPO 엑셀 갱신
현재 방식: 메일을 하나씩 열어 손으로 입력
목표 방식: 메일을 읽어 바꿀 칸을 표로 제안
AX 방향: 기준 정리 후 자동화
사용 도구: PowerShell, HTML
진행 단계: 수정
적용 후 소요 시간(1회, 분): 15
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
  assert.equal(r.stage, "수정");
  assert.equal(r.minNow, null); // 적용 전 시간은 직접 입력 칸
  assert.equal(r.minAfter, 15);
  assert.equal(r.cycle, "매주");
  assert.equal(r.blocked, "PDF 글자 인식이 가끔 틀림");
  assert.equal("progress" in r, false); // 진척도(%) 칸 없음
});

test("마크다운 꾸밈·전각 콜론·코드 블록이 섞여도 읽는다", () => {
  const md = "```\n- **과제명**： 견적 비교표\n- 진행 단계: 구현\n```";
  const r = parseReport(md);
  assert.equal(r.title, "견적 비교표");
  assert.equal(r.stage, "구현");
});

test("여러 줄 값(터미널 줄바꿈)은 다음 칸이 나올 때까지 띄어쓰기로 이어 붙인다", () => {
  const r = parseReport("이번에 한 것: 첫째\n둘째 줄\n막힌 점: 없음");
  assert.equal(r.done, "첫째 둘째 줄");
  assert.equal(r.blocked, "없음");
});

test("선택지는 비슷한 표현도 정해진 값으로 맞추고, 범위 밖 숫자는 자른다", () => {
  const r = parseReport("AX 방향: 완전자동화\n진행 단계: 실무적용 중\n적용 후 소요 시간: -5\n반복 주기: 매일(평일)");
  assert.equal(r.direction, "완전 자동화");
  assert.equal(r.stage, "실무 적용");
  assert.equal(r.minAfter, 0);
  assert.equal(r.cycle, "매일");
});

test("예전 단계 이름도 새 단계로 바꿔 읽는다", () => {
  assert.equal(parseReport("현재 단계: 검증").stage, "수정");
  assert.equal(parseReport("진행 단계: 첫 버전").stage, "구현");
  assert.equal(normStage("주제 선정"), "아이디어");
  assert.equal(normStage("실무 적용"), "실무 적용");
  assert.equal(stageIndex("검증"), 3);
  assert.equal(stageIndex(""), -1);
});

test("적용 전 시간은 처음 입력한 값을 쓴다 (최신순 목록)", () => {
  const newestFirst = [{ minNow: 30 }, { minNow: null }, { minNow: 90 }, { minNow: null }];
  assert.equal(firstMinNow(newestFirst), 90);
  assert.equal(firstMinNow([{ minNow: null }]), null);
});

test("없는 칸은 빈 값, 엉뚱한 글은 무시한다", () => {
  const r = parseReport("안녕하세요. 정리해 드리겠습니다.\n과제명: A");
  assert.equal(r.title, "A");
  assert.equal(r.task, "");
  assert.equal(r.minAfter, null);
});

test("월 단축 시간 = (적용 전-적용 후) × 월 횟수 ÷ 60", () => {
  assert.equal(monthlySavedHours({ minNow: 90, minAfter: 15, cycle: "매주" }), 5);
  assert.equal(monthlySavedHours({ minNow: 30, minAfter: 0, cycle: "매일" }), 10);
  assert.equal(monthlySavedHours({ minNow: 60, minAfter: 20, cycle: "매월" }), 40 / 60);
  assert.equal(monthlySavedHours({ minNow: null, minAfter: 15, cycle: "매주" }), null);
  assert.equal(monthlySavedHours({ minNow: 10, minAfter: 20, cycle: "매주" }), 0);
});

test("프롬프트: 현재 세션만, 적용 전 시간·진척도는 묻지 않고, 그대로 붙여넣어도 형식이 읽힌다", () => {
  const p = buildPrompt();
  assert.match(p, /이 대화\(현재 세션\)/);
  assert.match(p, /이전 대화/);
  assert.match(p, /적용 후 소요 시간/);
  assert.doesNotMatch(p, /적용 전/);
  assert.doesNotMatch(p, /진척도/);
  const r = parseReport(p);
  assert.equal(r.title, "");
  assert.equal(r.direction, "");
  assert.equal(r.stage, "");
  assert.equal(r.cycle, "");
  assert.equal(r.minAfter, null);
});

// 11/20 실제 결과: 현재·목표 방식, 적용 후 시간, 반복 주기가 비어서 옴
const REAL_1120 = `[AX 챌린지 보고]
과제명: LED 수주 현황표(OPO) 업데이트 할 일 자동 정리 도구
대상 업무: LED 수주 현황표(OPO)의 출고·출항·도착·납품 날짜와 수량 관리
현재 방식:
목표 방식:
AX 방향: 사람 판단 보조
사용 도구: Claude Code, PowerShell, Excel, Outlook
진행 단계: 실무 적용
적용 후 소요 시간(1회, 분):
반복 주기:
이번에 한 것: 출하 일정표 엑셀을 근거로 빈칸 27개를 채움
막힌 점: 담당자 판단 필요
다음 할 것: 빠진 납품 1건 반영
[끝]`;

test("프롬프트: 칸을 비우지 않게 칸별 작성 기준을 주고, 반복 주기도 AI가 채운다", () => {
  const p = buildPrompt();
  assert.match(p, /작성 기준/);
  assert.match(p, /현재 방식 →/);
  assert.match(p, /목표 방식 →/);
  assert.match(p, /적용 후 소요 시간 →/);
  assert.match(p, /\(추정\)/);
  assert.doesNotMatch(p, /비워 둬/);
  assert.match(p, /^반복 주기:/m);
  assert.match(p, /반복 주기 →/);
  // 작성 기준 줄이 칸으로 잘못 읽히면 안 됨
  const r = parseReport(p);
  assert.equal(r.asis, "");
  assert.equal(r.tobe, "");
  assert.equal(r.minAfter, null);
});

test("(추정)이 붙은 숫자도 읽는다", () => {
  assert.equal(parseReport("적용 후 소요 시간(1회, 분): 20 (추정)").minAfter, 20);
});

test("11/20 실제 결과의 빈 칸 목록을 찾는다", () => {
  const r = parseReport(REAL_1120);
  assert.equal(r.stage, "실무 적용");
  assert.equal(r.direction, "사람 판단 보조");
  assert.deepEqual(emptyFields(r), ["asis", "tobe", "minAfter", "cycle"]);
});

test("터미널에서 복사해 칸 이름이 줄 중간에 붙어도 칸을 나눠 읽는다 (11/20 실제 결과)", () => {
  const txt = readFileSync(new URL("./fixtures/real_1120b.txt", import.meta.url), "utf8");
  const r = parseReport(txt);
  assert.match(r.asis, /^출하 일정표 엑셀/);
  assert.match(r.asis, /틀린 곳을 찾음 \(추정\)$/);
  assert.match(r.tobe, /^스크립트가 공유 폴더의 최신 OPO/);
  assert.match(r.tobe, /빈칸을 새 버전 파일에/);
  assert.match(r.tobe, /판단함$/);
  assert.equal(r.direction, "사람 판단 보조");
  assert.equal(r.tools, "Claude Code, PowerShell, Excel, Outlook");
  assert.equal(r.stage, "실무 적용");
  assert.equal(r.minAfter, 10);
  assert.match(r.done, /^출하 일정표 엑셀\(메일 첨부\)/);
  assert.match(r.blocked, /다시 올려야 함$/);
  assert.match(r.next, /검토 \(추정\)$/);
  assert.doesNotMatch(r.done, /\s{2,}/);
});

test("반복 주기에 (추정)이 붙어도 고른다", () => {
  assert.equal(parseReport("반복 주기: 매주 (추정)").cycle, "매주");
});

test("프롬프트: 막힌 점은 만드는 과정의 문제만(없으면 없음), 다음 할 것은 짧은 명사형", () => {
  const p = buildPrompt();
  const blocked = p.split("\n").find((l) => l.includes("막힌 점 →")) || "";
  assert.match(blocked, /만드는 과정/);
  assert.match(blocked, /없음/);
  const next = p.split("\n").find((l) => l.includes("다음 할 것 →")) || "";
  assert.match(next, /명사/);
  // 작성 기준 줄은 여전히 칸으로 읽히면 안 됨
  const r = parseReport(p);
  assert.equal(r.blocked, "");
  assert.equal(r.next, "");
});
