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
  // 반복 주기는 세션 안에 근거가 없어 본인이 직접 입력 (지난 값 유지)
  { key: "cycle",     label: "반복 주기", choices: ["매일", "매주", "매월"], manual: true },
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
    "- 근거는 이 세션에서 실제로 한 작업, 만든 파일, 실행 결과다. 이전 대화나 메모리 내용을 사실처럼 가져오지 마.",
    "- 형식의 칸은 모두 채워. 세션에 직접 적힌 내용이 없으면 세션에서 한 작업으로 판단해 쓰고 끝에 (추정)을 붙여.",
    "- 없는 파일·숫자·결과를 지어내지는 마. 선택 칸은 보기 중 하나만 남기고, 형식 밖의 인사말이나 설명은 쓰지 마.",
    "- 고객사 이름, 단가, 개인 정보는 쓰지 마.",
    "",
    "작성 기준",
    "· 현재 방식 → 이 도구 없이 사람이 하던 방식. 이 세션에서 대신 처리한 작업을 원래는 어떻게 했는지",
    "· 목표 방식 → 이 세션에서 만들거나 쓴 도구가 하는 일, 그리고 사람이 남아서 확인·판단할 일",
    "· 적용 후 소요 시간 → 이 세션에서 도구를 돌리고 결과를 확인하는 데 걸린 시간을 기준으로 1회 처리 시간(분) 숫자. 실측이 아니면 숫자 뒤에 (추정)",
    "· 진행 단계 → 아이디어(주제만 정함) / 설계(입력·규칙·출력 정리) / 구현(첫 버전 동작) / 수정(시험하며 고치는 중) / 실무 적용(실제 업무에 사용) / 완료",
    "· 이번에 한 것 → 이 세션에서 한 일만",
    "",
    "[AX 챌린지 보고]",
    ...lines,
    "[끝]"
  ].join("\n");
}

// 붙여넣은 결과에서 비어 있는 칸 (월 단축 계산·보고에 필요한 칸 기준, 적용 전 시간은 따로 직접 입력)
export const NEEDED = ["title", "task", "asis", "tobe", "direction", "stage", "minAfter", "cycle"];
export function emptyFields(r) {
  return NEEDED.filter((k) => r[k] == null || r[k] === "");
}
