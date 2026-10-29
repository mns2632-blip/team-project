// 실시간 관제 화면: 종합 상태, 센서 게이지, 작업자 판정, 처리 필요 목록
const ARC = 163.4;   // 반원 게이지 길이 (π × 52)

function renderStatus() {
  const { level, reason } = overall();
  $("mon-status").className = "mon-status " + level;
  $("mon-status-title").textContent = LEVEL[level];
  $("mon-status-reason").textContent = reason;
}

function renderSite() {
  $("mon-site").textContent = [settings.site, settings.zone].filter(Boolean).join(" · ");
}

// 게이지 눈금: 위험 기준의 1.25배를 끝으로 잡고 주의·위험 구간을 색으로 표시
function renderGaugeBands() {
  for(const key of Object.keys(SENSORS)) {
    const g = $("g-" + key), t = settings.thr[key], max = t.danger * 1.25;
    const w = t.warn / max * ARC, d = t.danger / max * ARC;
    g.querySelector(".arc-warn").setAttribute("stroke-dasharray", `0 ${w} ${d - w} ${ARC}`);
    g.querySelector(".arc-danger").setAttribute("stroke-dasharray", `0 ${d} ${ARC - d} ${ARC}`);
    g.querySelector(".gauge-thr").textContent = `주의 ${t.warn} · 위험 ${t.danger}`;
    g.querySelector(".gauge-unit").textContent = SENSORS[key].unit;
    g.querySelector(".arc-val").setAttribute("stroke", SENSORS[key].color);
    g.querySelector(".gauge-spark polyline").setAttribute("stroke", SENSORS[key].color);
  }
}

function renderGauges() {
  const last = state.samples.at(-1);
  if(!last) return;
  const recent = state.samples.filter(s => s.t > Date.now() - 10 * 60 * 1000);
  for(const key of Object.keys(SENSORS)) {
    const g = $("g-" + key), v = last[key], lv = statusOf(key, v), max = settings.thr[key].danger * 1.25;
    g.className = "card gauge " + lv;
    const badge = g.querySelector(".gauge-state");
    badge.className = "badge gauge-state " + lv;
    badge.textContent = LEVEL[lv];
    g.querySelector(".gauge-num").textContent = fmt(key, v);
    const arc = g.querySelector(".arc-val");
    arc.setAttribute("stroke-dasharray", `${Math.min(1, Math.max(0, v / max)) * ARC} ${ARC + 1}`);
    arc.setAttribute("stroke", lv === "danger" ? "#DC2626" : SENSORS[key].color);

    // 최근 10분 스파크라인과 변화량
    const vals = recent.map(s => s[key]);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    g.querySelector(".gauge-spark polyline").setAttribute("points",
      vals.map((x, i) => `${(i / Math.max(1, vals.length - 1) * 120).toFixed(1)},${(22 - (x - lo) / span * 20).toFixed(1)}`).join(" "));
    const delta = vals.length > 1 ? vals.at(-1) - vals[0] : 0;
    g.querySelector(".gauge-trend").textContent =
      (delta > 0 ? "↗ +" : delta < 0 ? "↘ −" : "→ ") + Math.abs(delta).toFixed(SENSORS[key].digits) + " · 10분";
  }
}

function renderWorker() {
  const s = state.detection;
  const lv = s.includes("쓰러짐") ? "danger" : s.includes("정지") ? "warn" : s === "정상" ? "ok" : "idle";
  $("worker").className = "card card-pad worker " + lv;
  $("worker-state").textContent =
    lv === "danger" ? "쓰러짐 의심" : lv === "warn" ? "장시간 정지" : lv === "ok" ? "정상" : s;
}

function renderWorkerFps(m) {
  $("worker-fps").textContent = m ? `${Math.round(m.inference_fps)} fps · 지연 ${Math.round(m.inference_latency_ms)}ms` : "--";
}

function renderTodo() {
  const open = events.filter(isOpen);
  const count = $("todo-count");
  count.textContent = open.length;
  count.className = "badge num " + (open.some(e => e.level === "danger") ? "danger" : open.length ? "warn" : "");
  $("todo-empty").hidden = open.length > 0;
  $("todo-list").hidden = open.length === 0;
  $("todo-list").innerHTML = open.slice(0, 6).map(e => `
    <li><span class="todo-bar ${e.level}"></span>
      <span class="todo-text"><span class="todo-msg">${esc(e.msg)}</span><span class="todo-time num">${timeStr(e.t)} · ${esc(e.src)}</span></span>
      <a class="btn btn-sm ${e.level === "danger" ? "btn-danger" : "btn-primary"}" href="#logs/${e.id}">대응</a></li>`).join("");
  const last = events[0];
  $("todo-last").textContent = last ? `마지막 이벤트 ${timeStr(last.t)} · ${last.msg}` : "기록된 이벤트가 없습니다";
}

// 전체 화면 보기 (카메라 화면의 전체 보기와 같은 동작)
function openFullscreen() { location.hash = "camera"; setTimeout(() => cameraFullscreen(), 0); }

function tickClock() {
  $("mon-clock").textContent = timeStr(Date.now());
  const d = new Date();
  $("mon-elapsed").textContent = `관제 경과 ${Math.floor((Date.now() - state.startedAt) / 60000)}분 · `
    + `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} (${"일월화수목금토"[d.getDay()]})`;
}
setInterval(tickClock, 1000);
tickClock();

$("crit-spine").textContent = SERVER_THR.spine + "°";
$("crit-still").textContent = SERVER_THR.still + "초";

on("status", renderStatus);
on("sample", renderGauges);
on("detection", renderWorker);
on("metrics", renderWorkerFps);
on("events", renderTodo);
on("settings", () => { renderSite(); renderGaugeBands(); renderGauges(); renderStatus(); renderTodo(); });
