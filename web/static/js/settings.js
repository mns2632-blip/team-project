// 시스템 설정 화면: 현장 정보, 임계치, 장치 상태, 경보 표시 (이 브라우저에 저장)

function loadSettingsForm() {
  $("st-site").value = settings.site;
  $("st-zone").value = settings.zone;
  for(const key of Object.keys(SENSORS)) {
    $(`st-${key}-warn`).value = settings.thr[key].warn;
    $(`st-${key}-danger`).value = settings.thr[key].danger;
  }
  $("st-bar").setAttribute("aria-checked", settings.dangerBar);
  $("st-err").textContent = "";
  $("st-msg").textContent = "";
}

function saveSettingsForm() {
  const thr = {};
  for(const key of Object.keys(SENSORS)) {
    const warn = parseFloat($(`st-${key}-warn`).value), danger = parseFloat($(`st-${key}-danger`).value);
    if(isNaN(warn) || isNaN(danger) || warn >= danger) {
      $("st-err").textContent = `${SENSORS[key].label}: 주의 기준은 위험 기준보다 작은 숫자여야 합니다.`;
      return;
    }
    thr[key] = { warn, danger };
  }
  Object.assign(settings, {
    site:$("st-site").value.trim(), zone:$("st-zone").value.trim(), thr,
    dangerBar:$("st-bar").getAttribute("aria-checked") === "true",
  });
  saveSettingsToStorage();
  $("st-err").textContent = "";
  $("st-msg").textContent = "저장했습니다";
  setTimeout(() => { $("st-msg").textContent = ""; }, 4000);
  emit("settings");
  renderDangerBar();
}

function clearEvents() {
  if(!confirm("이 브라우저에 저장된 이벤트와 처리 기록을 모두 삭제할까요?")) return;
  events.length = 0;
  saveEvents();
  emit("events");
}

function renderDeviceBadges() {
  const set = (id, lv, text) => { $(id).className = "badge " + lv; $(id).textContent = text; };
  const m = state.metrics;
  set("st-dev-cam", m?.camera_available ? "ok" : "danger",
    m ? (m.camera_available ? `연결됨 · ${m.camera_fps.toFixed(0)} fps` : "오프라인") : "확인 불가");
  const age = lastSensorAt ? (Date.now() - lastSensorAt) / 1000 : null;
  set("st-dev-sensor", age == null ? "" : age < 10 ? "ok" : "danger", age == null ? "대기 중" : age < 10 ? "수신 중" : "수신 끊김");
  const th = state.thermal;
  set("st-dev-thermal", th ? (th.connected ? "ok" : "warn") : "", th ? (th.connected ? "연결됨" : "더미 모드") : "대기 중");
}

$("st-bar").addEventListener("click", e =>
  e.currentTarget.setAttribute("aria-checked", e.currentTarget.getAttribute("aria-checked") !== "true"));
$("st-spine").textContent = SERVER_THR.spine + "°";
$("st-still").textContent = SERVER_THR.still + "초";
$("st-th-warn").textContent = SERVER_THR.thermalWarn + "°C";
$("st-th-danger").textContent = SERVER_THR.thermalDanger + "°C";

on("page", p => { if(p === "settings") { loadSettingsForm(); renderDeviceBadges(); } });
on("metrics", renderDeviceBadges);
on("thermal", renderDeviceBadges);
on("sample", () => { if(currentPage === "settings") renderDeviceBadges(); });
