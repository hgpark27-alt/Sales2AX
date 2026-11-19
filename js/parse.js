// 보고 형식 해석기: AI 에이전트가 낸 글 → 칸별 값
// 형식(칸 이름)을 바꾸려면 FIELDS만 고치면 됩니다.

export const FIELDS = [
  { key: "title",     label: "과제명" },
  { key: "task",      label: "대상 업무" },
  { key: "asis",      label: "현재 방식" },
  { key: "tobe",      label: "목표 방식" },
  { key: "direction", label: "AX 방향",  choices: ["완전 자동화", "기준 정리 후 자동화", "사람 판단 보조"] },
  { key: "tools",     label: "사용 도구" },
  { key: "stage",     label: "현재 단계", choices: ["주제 선정", "설계", "첫 버전", "검증", "실무 적용", "완료"] },
  { key: "progress",  label: "진척도",   num: [0, 100], hint: "(%)" },
  { key: "minNow",    label: "현재 소요 시간", num: [0, 100000], hint: "(1회, 분)" },
  { key: "minAfter",  label: "예상 소요 시간", num: [0, 100000], hint: "(1회, 분)" },
  { key: "cycle",     label: "반복 주기", choices: ["매일", "매주", "매월"] },
  { key: "done",      label: "이번에 한 것" },
  { key: "blocked",   label: "막힌 점" },
  { key: "next",      label: "다음 할 것" }
];

export const PER_MONTH = { "매일": 20, "매주": 4, "매월": 1 };

const squash = (s) => s.replace(/\s+/g, "");

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
  const f = FIELDS.find((x) => squash(x.label) === name);
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
    else if (f.choices) out[f.key] = toChoice(v, f.choices);
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
  const lines = FIELDS.map((f) => {
    const opt = f.choices ? " (" + f.choices.join(" / ") + " 중 하나)" : "";
    return f.label + (f.hint || "") + ":" + opt;
  });
  return [
    "지금까지 진행한 AX 챌린지 과제를 아래 형식 그대로 정리해 줘.",
    "- 형식 밖의 인사말이나 설명은 쓰지 마.",
    "- 확인되지 않은 내용은 지어내지 말고 칸을 비워 둬.",
    "- 고객사 이름, 단가, 개인 정보는 쓰지 마.",
    "- 소요 시간은 숫자(분)만, 진척도는 0~100 숫자만.",
    "",
    "[AX 챌린지 보고]",
    ...lines,
    "[끝]"
  ].join("\n");
}
