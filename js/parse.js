// 보고 형식 해석기: AI 에이전트가 낸 글 → 칸별 값
// 형식(칸 이름)을 바꾸려면 FIELDS만 고치면 됩니다.

export const FIELDS = [
  { key: "title",     label: "과제명" },
  { key: "task",      label: "대상 업무" },
  { key: "asis",      label: "현재 방식" },
  { key: "tobe",      label: "목표 방식" },
  { key: "direction", label: "AX 방향",  choices: ["완전 자동화", "기준 정리 후 자동화", "사람 판단 보조"] },
  { key: "tools",     label: "사용 도구" },
  { key: "stage",     label: "진행 단계", choices: ["아이디어", "설계", "구현", "수정", "실무 적용", "완료"] },
  // 적용 전 시간은 본인이 직접 입력 (프롬프트에서 뺌, 처음 입력값을 계속 씀)
  { key: "minNow",    label: "적용 전 소요 시간", num: [0, 100000], hint: "(1회, 분)", manual: true },
  { key: "minAfter",  label: "적용 후 소요 시간", num: [0, 100000], hint: "(1회, 분)" },
  { key: "cycle",     label: "반복 주기", choices: ["매일", "매주", "매월"] },
  { key: "done",      label: "이번에 한 것" },
  { key: "blocked",   label: "막힌 점" },
  { key: "next",      label: "다음 할 것" }
];

export const PER_MONTH = { "매일": 20, "매주": 4, "매월": 1 };

const squash = (s) => s.replace(/\s+/g, "");

// 진행 단계 (진척도 대신). 예전 단계 이름은 새 이름으로 바꿔 읽음 (11/19 이전 보고 호환)
export const STAGES = FIELDS.find((f) => f.key === "stage").choices;
const STAGE_ALIAS = { "주제선정": "아이디어", "첫버전": "구현", "검증": "수정" };
export const normStage = (v) => STAGE_ALIAS[squash(v || "")] || v || "";
export const stageIndex = (v) => STAGES.indexOf(normStage(v));

// 적용 전 소요 시간 = 처음 입력한 값 (reports는 최신순)
export function firstMinNow(reports) {
  for (let i = reports.length - 1; i >= 0; i--) if (reports[i].minNow != null) return reports[i].minNow;
  return null;
}

function cleanLine(line) {
  return line
    .replace(/^\s*(?:[-*•>]|\d+[.)])\s+/, "")   // 목록 기호
    .replace(/\*\*|__|`/g, "")                    // 굵게·코드 표시
    .trim();
}

// "과제명: 값", "진척도(%): 70" 처럼 칸 이름으로 시작하는 줄을 찾음
function matchField(line) {
  const m = line.match(/^([^:：]{1,30})[:：]\s*(.*)$/);
  if (!m) return null;
  const name = squash(m[1].replace(/\(.*?\)|（.*?）/g, ""));
  const f = FIELDS.find((x) => squash(x.label) === name) || (name === "현재단계" ? FIELDS.find((x) => x.key === "stage") : null);
  return f ? { f, value: m[2].trim() } : null;
}

function toNumber(v, [lo, hi]) {
  const m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  return Math.min(hi, Math.max(lo, Number(m[0])));
}

function toChoice(v, choices) {
  const s = squash(v);
  if (!s) return "";
  // 선택지 목록을 그대로 둔 경우("A / B / C 중 하나")는 고르지 않은 것으로 봄
  if (choices.filter((c) => s.includes(squash(c))).length > 1 || /중하나/.test(s)) return "";
  return choices.find((c) => s.includes(squash(c))) || choices.find((c) => squash(c).includes(s)) || "";
}

export function parseReport(text) {
  const raw = {};
  let cur = null;
  for (const line0 of String(text || "").split(/\r?\n/)) {
    const line = cleanLine(line0);
    if (/^```/.test(line0.trim()) || /^\[.*(보고|끝).*\]$/.test(line)) { cur = null; continue; }
    const hit = matchField(line);
    if (hit) { cur = hit.f.key; raw[cur] = hit.value; continue; }
    if (cur && line) raw[cur] = raw[cur] ? raw[cur] + "\n" + line : line;
  }
  const out = {};
  for (const f of FIELDS) {
    const v = (raw[f.key] || "").trim();
    if (f.num) out[f.key] = v ? toNumber(v, f.num) : null;
    else if (f.choices) out[f.key] = toChoice(f.key === "stage" ? normStage(v) : v, f.choices);
    else out[f.key] = v;
  }
  return out;
}

// 월 단축 시간 = (현재 − 예상) × 월 반복 횟수 ÷ 60
export function monthlySavedHours(r) {
  if (r.minNow == null || r.minAfter == null || !PER_MONTH[r.cycle]) return null;
  return Math.max(0, r.minNow - r.minAfter) * PER_MONTH[r.cycle] / 60;
}

// 에이전트에 넣을 프롬프트 (형식은 FIELDS에서 자동 생성)
export function buildPrompt() {
  const lines = FIELDS.filter((f) => !f.manual).map((f) => {
    const opt = f.choices ? " (" + f.choices.join(" / ") + " 중 하나)" : "";
    return f.label + (f.hint || "") + ":" + opt;
  });
  return [
    "이 대화(현재 세션)에서 진행한 AX 챌린지 과제를 아래 형식 그대로 정리해 줘.",
    "- 이 세션에서 실제로 한 작업, 만든 파일, 실행 결과만 근거로 써.",
    "- 이전 대화나 메모리, 추측으로 채우지 마. 이 세션에서 알 수 없는 칸은 비워 둬. (비운 칸은 지난 보고 값이 유지됨)",
    "- \"이번에 한 것\"은 이 세션에서 한 일만 써.",
    "- 선택 칸은 보기 중 하나만 남겨. 형식 밖의 인사말이나 설명은 쓰지 마.",
    "- 고객사 이름, 단가, 개인 정보는 쓰지 마.",
    "- 적용 후 소요 시간은 이 세션에서 만든 방식으로 1회 처리할 때 걸리는 시간을 숫자(분)만.",
    "",
    "[AX 챌린지 보고]",
    ...lines,
    "[끝]"
  ].join("\n");
}
