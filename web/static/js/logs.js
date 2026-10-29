// 이상 감지 로그 화면: 요약, 필터, 이벤트 목록, 대응 상태·종결 보고
const STATUS = { open:"미처리", active:"대응 중", done:"처리 완료", fp:"오탐" };
let lgFilter = "all";
let lgSelected = null;

function lgFiltered() {
  const q = $("lg-q").value.trim().toLowerCase(), src = $("lg-src").value;
  return events.filter(e =>
    (!q || e.msg.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)) &&
    (!src || e.src === src) &&
    (lgFilter === "all" || (lgFilter === "open" ? isOpen(e) : e.level === lgFilter)));
}

function renderLogs() {
  const today = new Date().toDateString();
  const todays = events.filter(e => new Date(e.t).toDateString() === today);
  $("lg-n-danger").textContent = todays.filter(e => e.level === "danger").length;
  $("lg-n-warn").textContent = todays.filter(e => e.level === "warn").length;
  $("lg-n-open").textContent = events.filter(isOpen).length;
  $("lg-n-done").textContent = todays.filter(e => !isOpen(e)).length;

  const list = lgFiltered();
  $("lg-count").textContent = `최신순 · ${list.length}건`;
  $("lg-list").innerHTML = list.length ? list.map(e => `
    <li><button type="button" data-id="${e.id}" aria-current="${e.id === lgSelected}">
      <span class="badge ${e.level}">${LEVEL[e.level] || "정보"}</span>
      <span class="lg-item-text"><span class="lg-item-msg">${esc(e.msg)}</span>
        <span class="lg-item-sub"><span class="num">${e.id} · ${timeStr(e.t)}</span> · ${esc(e.src)}</span></span>
      <span class="lg-st ${e.status}">${STATUS[e.status]}</span>
    </button></li>`).join("") : '<li class="empty">조건에 맞는 이벤트가 없습니다</li>';
  renderDetail();
}

function renderDetail() {
  const e = events.find(x => x.id === lgSelected);
  $("lg-detail-empty").hidden = !!e;
  $("lg-detail-body").hidden = !e;
  if(!e) return;
  const lv = $("lg-d-level");
  lv.className = "badge " + e.level;
  lv.textContent = LEVEL[e.level] || "정보";
  $("lg-d-id").textContent = `${e.id} · ${timeStr(e.t)}`;
  const st = $("lg-d-status");
  st.className = "badge " + (e.status === "open" ? "danger" : e.status === "active" ? "warn" : e.status === "done" ? "ok" : "");
  st.textContent = STATUS[e.status];
  $("lg-d-msg").textContent = e.msg;
  $("lg-d-time").textContent = dateTimeStr(e.t);
  $("lg-d-src").textContent = e.src;
  $("lg-d-zone").textContent = [settings.site, settings.zone].filter(Boolean).join(" · ") || "미지정 (시스템 설정에서 입력)";
  $("lg-d-metrics").innerHTML = Object.entries(SENSORS).map(([k, s]) => {
    const v = e.snapshot?.[k];
    return `<div><div class="lbl">${s.label}</div><div class="num ${statusOf(k, v)}">${fmt(k, v)}${typeof v === "number" ? s.unit : ""}</div></div>`;
  }).join("");
  $("lg-act-start").hidden = e.status !== "open";
  $("lg-act-done").hidden = !isOpen(e);
  $("lg-act-fp").hidden = !isOpen(e);
  $("lg-act-reopen").hidden = isOpen(e);
  if(document.activeElement !== $("lg-memo")) $("lg-memo").value = e.memo || "";
  $("lg-cause").value = e.cause || "";
  $("lg-d-history").innerHTML = e.history.map(h =>
    `<li><span class="num">${timeStr(h.t)}</span><span>${esc(h.msg)}</span></li>`).join("");
}

function selectEvent(id) {
  lgSelected = id;
  $("lg-saved").textContent = "";
  renderLogs();
}

function setEventStatus(status) {
  const notes = { active:"관제 담당자 확인 · 대응 시작", done:"처리 완료", fp:"오탐으로 종결", open:"다시 열림" };
  updateEvent(lgSelected, { status }, notes[status]);
}

function saveEventReport() {
  updateEvent(lgSelected, { cause:$("lg-cause").value, memo:$("lg-memo").value }, "종결 보고 기록");
  $("lg-saved").textContent = "저장했습니다";
}

function exportLogCSV() {
  const list = lgFiltered();
  if(!list.length) { alert("내보낼 이벤트가 없습니다."); return; }
  downloadCSV(`events-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["이벤트 번호", "시간", "등급", "출처", "내용", "상태", "원인", "조치 내용"],
    ...list.map(e => [e.id, dateTimeStr(e.t), LEVEL[e.level] || "정보", e.src, e.msg,
      STATUS[e.status], e.cause, e.memo]),
  ]);
}

$("lg-list").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-id]");
  if(b) selectEvent(b.dataset.id);
});
$("lg-level").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-f]");
  if(!b) return;
  lgFilter = b.dataset.f;
  $("lg-level").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderLogs();
});
$("lg-q").addEventListener("input", renderLogs);
$("lg-src").addEventListener("change", renderLogs);

on("events", renderLogs);
on("settings", renderLogs);
on("route-arg", ({ page, arg }) => { if(page === "logs") selectEvent(arg); });
