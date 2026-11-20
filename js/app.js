import { FIELDS, STAGES, parseReport, monthlySavedHours, buildPrompt, normStage, stageIndex, firstMinNow, emptyFields } from "./parse.js";
import { loadReports, saveReport } from "./store.js";

// ── 팀원·일정 (바꿀 때는 firestore.rules의 팀원 목록도 같이) ──
const MEMBERS = [
  { id: "dave", name: "Dave" }, { id: "eric", name: "Eric" }, { id: "ethan", name: "Ethan" },
  { id: "rodrigo", name: "Rodrigo" }, { id: "sumin", name: "Sumin" }
];
const WEEKS = [
  { w: "1주차", t: "기본 교육 + 주제 선정 과제", d: "AI 기본, 바이브 코딩, 업무 쪼개기, 요청과 검증. 실제 활용 사례 시연", h: "자동화할 본인 업무 주제 1개 선정" },
  { w: "2주차", t: "주제 발표 + 대표 빌드 시연", d: "각자 주제 발표. 진행자가 본인 주제를 실제로 빌드하는 과정 시연. 자동화 도구 개론(GitHub, Firebase, VBA, Python, AHK 등)과, 고르기 어려운 것은 AI에게 묻는 요청 구체화 방법", h: "첫 버전 만들기, 이 페이지에 진행 보고" },
  { w: "3주차", t: "중간점검", d: "각자 진행 상황 시연, 막힌 점 공동 피드백", h: "검증 후 실제 업무에 적용, 진행 보고" },
  { w: "4주차", t: "MVP 결과 발표", d: "각자 MVP 발표, 소요 시간 단축 효과 공유, 다음 적용 업무 정리", h: "최종 보고" }
];
const ABOUT = [
  ["목적", "AI를 질문·번역·PPT에만 쓰는 데서 벗어나, 실제 내 업무 파일을 AI로 처리하는 경험을 만듭니다."],
  ["방식", "강의는 1주차 한 번. 이후에는 각자 고른 반복 업무 하나를 바이브 코딩(말로 설명하면 AI가 프로그램을 만들어 주는 방식)으로 직접 만들어 갑니다."],
  ["결과물", "1인 1개 MVP(최소한으로 동작하는 업무 도구). 매번 AI에게 묻지 않아도 같은 입력이면 같은 결과가 나오는 도구입니다."],
  ["대상", `영업2팀 ${MEMBERS.length}명 (${MEMBERS.map((m) => m.name).join(", ")}), 주 1회 60분, 4주`],
  ["이 페이지", "진행 관리용입니다. 각자 진행 상황을 보고하면, 팀 전체의 과제·진행 단계·예상 단축 시간이 요약 페이지에 모입니다."]
];
const DIRS = FIELDS.find((f) => f.key === "direction").choices;

// ── 공통 도구 ──
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ymd = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const ymdhm = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const hrs = (h) => h == null ? "-" : (Math.round(h * 10) / 10).toLocaleString("ko-KR");
// 진행 단계 막대: 단계 수만큼 칸, 현재 단계까지 그 단계 색으로 채움
const stageBar = (stage) => {
  const i = stageIndex(stage);
  if (i < 0) return '<span class="none">-</span>';
  return `<div class="stagebar s${i}" title="${esc(STAGES[i])} (${i + 1}/${STAGES.length})"><div class="segs">${STAGES.map((_, k) => `<i${k <= i ? ' class="on"' : ""}></i>`).join("")}</div><span>${esc(STAGES[i])}</span></div>`;
};
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), Math.max(1800, msg.length * 70)); }
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => toast("복사했습니다"));
  const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast("복사했습니다"); } catch (e) { toast("Ctrl+C로 복사하세요"); }
  ta.remove(); return Promise.resolve();
}
function latestByMember(reports) {
  const m = {};
  for (const r of reports) if (!(r.member in m)) m[r.member] = r; // 최신순이므로 처음 것이 최신
  for (const k in m) if (!m[k].title) delete m[k]; // 최신이 빈 보고(삭제) → 보고 없음
  return m;
}
// 페이지 머리말: 위치(어느 메뉴의 어느 화면) + 제목 + 한 줄 설명 + 오른쪽 버튼·정보
const pageHead = ({ path, title, desc = "", side = "" }) => `
  <div class="pagehead">
    <div class="ph-text">
      <div class="ph-path">${path}</div>
      <h2 class="ph-title">${title}</h2>
      ${desc ? `<p class="ph-desc">${desc}</p>` : ""}
    </div>
    ${side ? `<div class="ph-side">${side}</div>` : ""}
  </div>`;
const errBox = (e) => `<div class="card"><p class="msg err">데이터를 불러오지 못했습니다. 인터넷 연결 또는 회사 네트워크 차단 여부를 확인해 주세요. (${esc(e && e.message || e)})</p></div>`;

// ── 홈 ──
async function renderHome() {
  view.innerHTML = `
    ${pageHead({ path: "챌린지", title: "챌린지 소개와 팀원 현황", desc: "4주 동안 각자 자기 업무 하나를 AI로 자동화합니다. 진행 상황은 팀원 페이지에서 보고하고, 요약 페이지에서 함께 봅니다." })}
    <section>
      <h2>이 챌린지는</h2>
      <div class="card scroll"><table class="about">${ABOUT.map((a) => `<tr><td class="k">${a[0]}</td><td>${a[1]}</td></tr>`).join("")}
      </table></div>
    </section>
    <section>
      <h2>일정 <span class="side">주 1회 60분</span></h2>
      <div class="card scroll"><table class="weeks">
        <tr><th>주차</th><th>주제와 내용</th><th>과제 (다음 주까지)</th></tr>
        ${WEEKS.map((w) => `<tr><td class="k">${w.w}</td><td><b>${esc(w.t)}</b><span class="sub">${esc(w.d)}</span></td><td>${esc(w.h)}</td></tr>`).join("")}
      </table></div>
    </section>
    <section>
      <h2>팀원 <span class="side">이름을 누르면 보고 페이지로 이동</span></h2>
      <div class="card scroll" id="members"><p class="msg">불러오는 중…</p></div>
    </section>
    <section>
      <h2>보고 방법</h2>
      <div class="card pad"><ol style="margin:0;padding-left:20px;display:grid;gap:4px">
        <li>내 이름을 눌러 보고 페이지로 이동합니다.</li>
        <li>프롬프트를 복사해 과제를 진행한 AI 대화(Claude Code 세션 등)에 붙여넣습니다. AI는 그 세션에서 한 일만 정리합니다.</li>
        <li>AI가 정리한 결과를 보고 페이지에 붙여넣으면 칸이 자동으로 채워집니다.</li>
        <li>내용을 확인·수정하고 저장합니다. 저장할 때마다 이력이 쌓입니다.</li>
      </ol></div>
    </section>`;
  try {
    const last = latestByMember(await loadReports());
    $("#members").innerHTML = `<table>
      <tr><th>팀원</th><th>과제</th><th>진행 단계</th><th class="num">최근 보고</th></tr>
      ${MEMBERS.map((m) => {
        const r = last[m.id];
        return `<tr class="link" data-href="#/m/${m.id}"><td class="k"><a href="#/m/${m.id}">${m.name}</a></td>
          <td>${r ? esc(r.title) + `<span class="sub">${esc(r.task)}</span>` : '<span class="none">아직 보고 없음</span>'}</td>
          <td>${stageBar(r && r.stage)}</td>
          <td class="num">${r ? ymd(r.createdAt) : '<span class="none">-</span>'}</td></tr>`;
      }).join("")}
    </table>`;
  } catch (e) { $("#members").outerHTML = errBox(e); }
}

// ── 팀원 보고 페이지 ──
function fieldInput(f) {
  const id = "f-" + f.key;
  const opt = ["title", "minNow", "minAfter", "cycle"].includes(f.key) ? ' <span class="opt">(필수)</span>' : "";
  const own = f.manual ? `<span class="own">직접 입력 · ${f.key === "minNow" ? "처음" : "지난"} 값 유지</span>` : "";
  let input;
  if (f.choices) input = `<select id="${id}"><option value="">-</option>${f.choices.map((c) => `<option>${c}</option>`).join("")}</select>`;
  else if (f.num) input = `<input id="${id}" type="number" inputmode="numeric" min="${f.num[0]}" max="${f.num[1]}">`;
  else if (["asis", "tobe", "done", "blocked", "next"].includes(f.key)) input = `<textarea id="${id}" maxlength="${f.key === "asis" || f.key === "tobe" ? 1000 : 2000}"></textarea>`;
  else input = `<input id="${id}" type="text" maxlength="${f.key === "title" ? 100 : 300}">`;
  return `<label data-k="${f.key}"><span>${f.label}${f.hint ? " " + f.hint : ""}${opt}${own}</span>${input}</label>`;
}

async function renderMember(id) {
  const m = MEMBERS.find((x) => x.id === id);
  if (!m) { location.hash = "#/"; return; }
  const byKey = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
  view.innerHTML = `
    ${pageHead({ path: `<a href="#/">챌린지</a><span>›</span>팀원 보고`, title: `${m.name}의 진행 보고`, desc: "AI가 정리한 진행 상황을 붙여넣고 확인한 뒤 저장합니다. 저장할 때마다 이력이 쌓입니다.", side: '<span class="ph-meta" id="last-at"></span>' })}
    <section>
      <h2><span class="no">1</span>프롬프트를 AI 에이전트에 넣기</h2>
      <div class="card">
        <div class="step-h"><span class="lbl">과제를 진행한 그 대화(세션)에 그대로 붙여넣으세요</span><span class="btns"><button class="btn dark" id="copy-prompt" type="button">복사</button></span></div>
        <pre class="prompt" id="prompt"></pre>
      </div>
    </section>
    <section>
      <h2><span class="no">2</span>AI가 정리한 결과 붙여넣기</h2>
      <div class="card">
        <div class="step-h"><span class="lbl">붙여넣으면 아래 칸이 자동으로 채워집니다. AI가 비워 둔 칸은 지난 보고 값을 쓰고, 그래도 빈 칸은 노란색으로 표시됩니다</span><span class="btns"><button class="btn" id="fill" type="button">다시 채우기</button></span></div>
        <textarea class="paste" id="paste" placeholder="[AX 챌린지 보고]&#10;과제명: …&#10;…&#10;[끝]"></textarea>
      </div>
    </section>
    <section>
      <h2><span class="no">3</span>확인하고 저장</h2>
      <form class="card" id="form" novalidate>
        <div class="form">
          ${["title", "task", "asis", "tobe"].map((k) => fieldInput(byKey[k]).replace("<label", '<label class="wide"')).join("")}
          ${fieldInput(byKey.direction)}${fieldInput(byKey.tools)}
          ${fieldInput(byKey.stage).replace("<label", '<label class="wide"')}
          <div class="row3">${fieldInput(byKey.minNow)}${fieldInput(byKey.minAfter)}${fieldInput(byKey.cycle)}</div>
          ${["done", "blocked", "next"].map((k) => fieldInput(byKey[k]).replace("<label", '<label class="wide"')).join("")}
        </div>
        <div class="form-foot"><span class="calc" id="calc">예상 월 단축 시간: -</span><button class="btn" id="del" type="button">삭제</button><button class="btn dark" id="save" type="submit">저장</button></div>
      </form>
      <p class="tip">처음 열면 마지막 보고 내용이 채워져 있습니다. 바뀐 칸만 고쳐서 저장해도 됩니다.</p>
    </section>
    <section>
      <h2>보고 이력</h2>
      <div class="card hist" id="hist"><p class="msg">불러오는 중…</p></div>
    </section>`;

  $("#prompt").textContent = buildPrompt();
  $("#copy-prompt").onclick = () => copyText(buildPrompt());

  const get = () => {
    const o = {};
    for (const f of FIELDS) {
      const v = $("#f-" + f.key).value.trim();
      o[f.key] = f.num ? (v === "" ? null : Math.min(f.num[1], Math.max(f.num[0], Number(v)))) : v;
    }
    return o;
  };
  const updateCalc = () => {
    const h = monthlySavedHours(get());
    $("#calc").innerHTML = `예상 월 단축 시간: <b>${h == null ? "-" : hrs(h) + "시간"}</b>`;
  };
  const put = (r, flash) => {
    for (const f of FIELDS) {
      const el = $("#f-" + f.key), v = r[f.key];
      if (v == null || v === "") continue;
      el.value = v;
      if (flash) { el.classList.remove("filled"); void el.offsetWidth; el.classList.add("filled"); }
    }
    updateCalc();
  };
  const fill = () => {
    const r = parseReport($("#paste").value);
    const n = FIELDS.filter((f) => r[f.key] != null && r[f.key] !== "").length;
    if (!n) { toast("형식에 맞는 칸을 찾지 못했습니다"); return; }
    put(r, true);
    // 붙여넣은 뒤에도 비어 있는 칸 표시 (지난 보고 값으로 채워진 칸은 제외)
    const now = get();
    const empty = [...emptyFields(now), ...(now.minNow == null ? ["minNow"] : [])];
    document.querySelectorAll("label.need").forEach((l) => l.classList.remove("need"));
    empty.forEach((k) => $(`label[data-k="${k}"]`).classList.add("need"));
    toast(empty.length ? `${n}개 칸을 채웠습니다. 빈 칸 ${empty.length}개는 직접 적어 주세요: ${empty.map((k) => FIELDS.find((f) => f.key === k).label).join(", ")}` : `${n}개 칸을 채웠습니다`);
  };
  $("#paste").addEventListener("paste", () => setTimeout(fill, 0));
  $("#fill").onclick = fill;
  $("#form").addEventListener("input", (e) => { updateCalc(); const l = e.target.closest("label.need"); if (l && e.target.value.trim()) l.classList.remove("need"); });

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = get();
    if (!d.title) { toast("과제명은 꼭 적어 주세요"); $("#f-title").focus(); return; }
    if (d.minNow == null) { toast("적용 전 소요 시간(분)을 적어 주세요"); $("#f-minNow").focus(); return; }
    if (d.minAfter == null) { toast("적용 후 소요 시간(분)을 적어 주세요"); $("#f-minAfter").focus(); return; }
    if (!d.cycle) { toast("반복 주기를 골라 주세요"); $("#f-cycle").focus(); return; }
    const btn = $("#save"); btn.disabled = true; btn.textContent = "저장 중…";
    try {
      await saveReport({ member: m.id, ...d, raw: $("#paste").value.slice(0, 6000) });
      toast("저장했습니다"); $("#paste").value = "";
      await loadHist(false);
    } catch (err) {
      toast("저장하지 못했습니다: " + (err.code || err.message));
    } finally { btn.disabled = false; btn.textContent = "저장"; }
  });

  $("#del").onclick = async () => {
    if (!confirm("내 보고를 비울까요? 요약 페이지에 '아직 보고 없음'으로 보입니다.")) return;
    const blank = Object.fromEntries(FIELDS.map((f) => [f.key, f.num ? null : ""]));
    const btn = $("#del"); btn.disabled = true;
    try {
      await saveReport({ member: m.id, ...blank, raw: "" });
      for (const f of FIELDS) $("#f-" + f.key).value = "";
      $("#paste").value = ""; updateCalc();
      toast("삭제했습니다"); await loadHist(false);
    } catch (err) { toast("삭제하지 못했습니다: " + (err.code || err.message)); }
    finally { btn.disabled = false; }
  };

  async function loadHist(prefill) {
    try {
      const mine = (await loadReports()).filter((r) => r.member === m.id);
      $("#last-at").textContent = mine.length ? `최근 보고 ${ymdhm(mine[0].createdAt)}` : "";
      if (prefill && mine[0]) {
        put({ ...mine[0], stage: normStage(mine[0].stage) }, false);
        const first = firstMinNow(mine); // 적용 전 시간 = 처음 입력값
        if (first != null) { $("#f-minNow").value = first; updateCalc(); }
      }
      $("#hist").innerHTML = mine.length ? mine.map((r) => `
        <details><summary><span class="d">${ymdhm(r.createdAt)}</span><span>${r.title ? esc(r.title) : '<span class="none">(삭제)</span>'}</span>${stageBar(r.stage)}</summary>
        <dl>${FIELDS.filter((f) => !["title", "stage"].includes(f.key) && r[f.key] != null && r[f.key] !== "")
          .map((f) => `<dt>${f.label}</dt><dd>${esc(r[f.key])}${f.num ? "분" : ""}</dd>`).join("")}</dl>
</details>`).join("")
        : '<p class="msg">아직 보고가 없습니다.</p>';
    } catch (e) { $("#hist").innerHTML = `<p class="msg err">이력을 불러오지 못했습니다. (${esc(e.message)})</p>`; }
  }
  updateCalc();
  loadHist(true);
}

// ── 팀장 요약 (본부장 보고용 보고서 형식, PDF 저장) ──
const ymdFull = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isBlocked = (r) => r.blocked && !/^(없음|없다|없습니다|-|n\/a|none)$/i.test(r.blocked.trim());

async function renderSummary() {
  view.innerHTML = `
    ${pageHead({ path: "요약", title: "영업2팀 AX 챌린지 진행 보고", desc: `본부장 보고용 보고서입니다. 팀원별 최신 보고 기준 · 기준일 ${ymdFull(new Date())}. 행을 누르면 해당 팀원의 보고 이력으로 이동합니다.`, side: '<button class="btn dark" id="pdf" type="button">PDF 저장 (1장)</button>' })}
    <div id="sum" class="stack"><div class="card"><p class="msg">불러오는 중…</p></div></div>
    <div id="sheet" class="sheet" aria-hidden="true"></div>`;
  let reports;
  try { reports = await loadReports(); } catch (e) { $("#sum").innerHTML = errBox(e); return; }
  const today = new Date();
  const last = latestByMember(reports);
  const rows = MEMBERS.map((m) => ({ m, r: last[m.id] }));
  const got = rows.filter((x) => x.r);
  const built = got.filter((x) => stageIndex(x.r.stage) >= STAGES.indexOf("구현")).length;
  const saved = got.map((x) => monthlySavedHours(x.r)).filter((h) => h != null);
  const blocked = got.filter((x) => isBlocked(x.r));
  const nexts = got.filter((x) => x.r.next);
  const count = (key, list) => list.map((c) => `<span><span class="t">${c}</span><b>${got.filter((x) => (key === "stage" ? normStage(x.r[key]) : x.r[key]) === c).length}</b></span>`).join("");

  $("#pdf").onclick = () => {
    const old = document.title;
    document.title = `영업2팀 AX 챌린지 진행 보고_${ymdFull(today).replace(/-/g, "")}`; // PDF 파일 이름
    window.print();
    document.title = old;
  };

  $("#sum").innerHTML = `
    <section>
      <h2><span class="no">1</span>개요</h2>
      <div class="card"><table class="about">${ABOUT.filter((a) => a[0] !== "이 페이지").map((a) => `<tr><td class="k">${a[0]}</td><td>${a[1]}</td></tr>`).join("")}
        <tr><td class="k">일정</td><td>${WEEKS.map((w) => `${w.w} ${esc(w.t)}`).join(" → ")}</td></tr>
      </table></div>
    </section>
    <section>
      <h2><span class="no">2</span>진행 현황 요약</h2>
      <div class="card stats">
        <div><span class="l">보고한 인원</span><span class="v">${got.length}<small>/ ${MEMBERS.length}명</small></span></div>
        <div><span class="l">구현 이상 진행</span><span class="v">${built}<small>/ ${got.length}명</small></span></div>
        <div><span class="l">예상 월 단축 시간 합계</span><span class="v">${saved.length ? hrs(saved.reduce((a, h) => a + h, 0)) : "-"}<small>시간</small></span></div>
        <div><span class="l">막힌 점이 있는 인원</span><span class="v">${blocked.length}<small>명</small></span></div>
      </div>
      <div class="card">
        <div class="dist"><b>진행 단계</b>${count("stage", STAGES)}</div>
        <div class="dist line"><b>AX 방향</b>${count("direction", DIRS)}</div>
      </div>
    </section>
    <section>
      <h2><span class="no">3</span>팀원별 과제 현황</h2>
      <div class="card scroll"><table class="rep">
        <tr><th>팀원</th><th>과제 · 대상 업무</th><th>AX 방향 · 도구</th><th>진행 단계</th><th class="num">1회 소요 (분)<span class="sub">적용 전 → 후</span></th><th class="num">월 단축</th><th class="num">보고일</th></tr>
        ${rows.map(({ m, r }) => !r
          ? `<tr class="link" data-href="#/m/${m.id}"><td class="k">${m.name}</td><td colspan="6"><span class="none">아직 보고 없음</span></td></tr>`
          : `<tr class="link" data-href="#/m/${m.id}">
              <td class="k">${m.name}</td>
              <td>${esc(r.title)}<span class="sub">${esc(r.task)}</span></td>
              <td>${r.direction ? `<span class="pill blue">${esc(r.direction)}</span>` : '<span class="none">-</span>'}<span class="sub">${esc(r.tools)}</span></td>
              <td>${stageBar(r.stage)}</td>
              <td class="num">${r.minNow ?? "-"} → ${r.minAfter ?? "-"}<span class="sub">${esc(r.cycle)}</span></td>
              <td class="num">${monthlySavedHours(r) == null ? '<span class="none">-</span>' : hrs(monthlySavedHours(r)) + "시간"}</td>
              <td class="num">${ymd(r.createdAt)}</td></tr>`).join("")}
      </table></div>
      <p class="tip">월 단축 시간 = (적용 전 − 적용 후 1회 소요 분) × 월 반복 횟수(매일 20, 매주 4, 매월 1) ÷ 60. 각자 보고한 예상치이며 실측이 아닙니다.</p>
    </section>
    <section>
      <h2><span class="no">4</span>막힌 점 (이슈)</h2>
      <div class="card">${blocked.length ? `<table class="rep">
        <tr><th>팀원</th><th>과제</th><th>막힌 점</th></tr>
        ${blocked.map(({ m, r }) => `<tr><td class="k">${m.name}</td><td>${esc(r.title)}</td><td class="pre">${esc(r.blocked)}</td></tr>`).join("")}
      </table>` : '<p class="msg">보고된 막힌 점이 없습니다.</p>'}</div>
    </section>
    <section>
      <h2><span class="no">5</span>다음 계획</h2>
      <div class="card">${nexts.length ? `<table class="rep">
        <tr><th>팀원</th><th>과제</th><th>다음 할 것</th></tr>
        ${nexts.map(({ m, r }) => `<tr><td class="k">${m.name}</td><td>${esc(r.title)}</td><td class="pre">${esc(r.next)}</td></tr>`).join("")}
      </table>` : '<p class="msg">보고된 다음 계획이 없습니다.</p>'}</div>
    </section>`;

  $("#sheet").innerHTML = sheetHTML({ today, rows, got, built, saved, blocked, nexts });
}

// ── PDF용 1장 보고서 (A4 가로, 인쇄할 때만 보임) ──
function sheetHTML({ today, rows, got, built, saved, blocked, nexts }) {
  const total = saved.reduce((a, h) => a + h, 0);
  const max = Math.max(0, ...got.map((x) => monthlySavedHours(x.r) || 0));
  const kpi = (l, v, u, s = "") => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}<small>${u}</small></span>${s ? `<span class="s">${s}</span>` : ""}</div>`;
  const stageCount = STAGES.map((s, i) => `<div><i class="dot s${i}"></i><span>${s}</span><b>${got.filter((x) => stageIndex(x.r.stage) === i).length}</b></div>`).join("");
  const list = (arr, key, empty) => arr.length
    ? `<ul>${arr.map(({ m, r }) => `<li><b>${m.name}</b><span class="clamp">${esc(r[key])}</span></li>`).join("")}</ul>`
    : `<p class="empty">${empty}</p>`;
  return `
    <div class="sh-top">
      <div><span class="sh-kicker">영업2팀 · AX 챌린지</span><h1>AX 챌린지 진행 보고</h1></div>
      <div class="sh-meta"><b>기준일 ${ymdFull(today)}</b><span>대상 영업2팀 ${MEMBERS.length}명 · 보고 ${got.length}명 · 팀원 자가 보고 기준</span></div>
    </div>
    <div class="sh-row1">
      <div class="sh-box">
        <h3>개요</h3>
        <dl>${ABOUT.filter((a) => ["목적", "방식", "결과물"].includes(a[0])).map((a) => `<dt>${a[0]}</dt><dd>${a[1]}</dd>`).join("")}</dl>
        <ol class="sh-weeks">${WEEKS.map((w) => `<li><span>${w.w}</span>${esc(w.t)}</li>`).join("")}</ol>
      </div>
      <div class="sh-box">
        <h3>핵심 수치</h3>
        <div class="kpis">
          ${kpi("보고 인원", got.length, ` / ${MEMBERS.length}명`)}
          ${kpi("구현 이상 진행", built, ` / ${got.length}명`)}
          ${kpi("예상 월 단축 시간", saved.length ? hrs(total) : "-", "시간", saved.length ? `연 환산 약 ${hrs(total * 12)}시간` : "")}
          ${kpi("막힌 점 있음", blocked.length, "명")}
        </div>
        <div class="sh-stages">${stageCount}</div>
      </div>
    </div>
    <div class="sh-box sh-table">
      <h3>팀원별 과제 현황</h3>
      <table>
        <colgroup><col style="width:11%"><col style="width:31%"><col style="width:17%"><col style="width:18%"><col style="width:10%"><col style="width:13%"></colgroup>
        <tr><th>팀원</th><th>과제 · 대상 업무</th><th>AX 방향 · 도구</th><th>진행 단계</th><th class="num">1회 소요(분)<br>적용 전 → 후</th><th>월 단축</th></tr>
        ${rows.map(({ m, r }) => !r
          ? `<tr><td class="k">${m.name}</td><td colspan="5" class="none">아직 보고 없음</td></tr>`
          : `<tr><td class="k">${m.name}</td>
              <td><span class="t clamp1">${esc(r.title)}</span><span class="sub clamp1">${esc(r.task)}</span></td>
              <td><span class="clamp1">${esc(r.direction) || "-"}</span><span class="sub clamp1">${esc(r.tools)}</span></td>
              <td>${stageBar(r.stage)}</td>
              <td class="num">${r.minNow ?? "-"} → ${r.minAfter ?? "-"}<span class="sub">${esc(r.cycle)}</span></td>
              <td>${monthlySavedHours(r) == null ? '<span class="none">-</span>'
                : `<div class="hbar"><i style="width:${max ? Math.round(monthlySavedHours(r) / max * 100) : 0}%"></i></div><span class="hv">${hrs(monthlySavedHours(r))}시간</span>`}</td></tr>`).join("")}
      </table>
    </div>
    <div class="sh-row3">
      <div class="sh-box"><h3>막힌 점 (이슈)</h3>${list(blocked, "blocked", "보고된 막힌 점이 없습니다.")}</div>
      <div class="sh-box"><h3>다음 계획</h3>${list(nexts, "next", "보고된 다음 계획이 없습니다.")}</div>
    </div>
    <div class="sh-foot">
      <span>월 단축 시간 = (적용 전 − 적용 후 1회 소요 분) × 월 반복 횟수(매일 20 · 매주 4 · 매월 1) ÷ 60. 연 환산 = 월 × 12. 팀원이 보고한 예상치이며 실측이 아닙니다.</span>
      <span>hgpark27-alt.github.io/Sales2AX</span>
    </div>`;
}

// ── 교육 자료 (보고와 분리된 탭, 원본 HTML을 그대로 보여 줌) ──
const DOCS = [
  { id: "basics", name: "AI 기초와 바이브 코딩", note: "1주차 교육" },
  { id: "cases", name: "AI 업무 활용 사례", note: "사례 시연 · 업무 환경 셋업" }
];
function renderEdu(id) {
  const d = DOCS.find((x) => x.id === id) || DOCS[0];
  view.innerHTML = `
    ${pageHead({ path: `교육 자료<span>›</span>${d.note}`, title: d.name, desc: "교육 때 쓰는 원본 자료입니다. 보고와는 별개이며, 아래 탭으로 자료를 바꿔 볼 수 있습니다." })}
    <div class="edu-head">
      <nav class="tabs doctabs">${DOCS.map((x) => `<a href="#/edu/${x.id}"${x.id === d.id ? ' class="on"' : ""}>${x.name}<span class="n">${x.note}</span></a>`).join("")}</nav>
      <a class="btn" href="edu/${d.id}.html" target="_blank" rel="noopener">새 창으로 열기</a>
    </div>
    <div class="card edu"><iframe src="edu/${d.id}.html" title="${d.name}" loading="lazy"></iframe></div>`;
}

// ── 화면 전환 ──
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [p, arg] = h.split("/");
  const tab = p === "summary" || p === "edu" ? p : "home";
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.r === tab));
  window.scrollTo(0, 0);
  if (p === "m") renderMember(arg);
  else if (p === "summary") renderSummary();
  else if (p === "edu") renderEdu(arg);
  else renderHome();
}
view.addEventListener("click", (e) => {
  const tr = e.target.closest("tr.link");
  if (tr && !e.target.closest("a")) location.hash = tr.dataset.href;
});
window.addEventListener("hashchange", route);
route();
