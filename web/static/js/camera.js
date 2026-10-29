// 카메라 관제 화면: AI 판정, 카메라 상태(/metrics), 최근 AI 이벤트, 전체 화면 보기

function detLevel(s) {
  return s.includes("쓰러짐") ? "danger" : s.includes("정지") ? "warn" : s === "정상" ? "ok" : "";
}

function renderCamDetection() {
  const s = state.detection, lv = detLevel(s);
  $("cam-det").className = "cam-det " + lv;
  $("cam-det").textContent = s;
  const badge = $("cam-det-badge");
  badge.className = "badge " + lv;
  badge.textContent = lv ? LEVEL[lv] : "대기";
  $("fs-status").textContent = "AI 판정 · " + s;
}

function renderCamMetrics(m) {
  const cam = $("cm-cam");
  if(!m) {
    cam.textContent = "확인 불가"; cam.className = "danger";
    ["cm-fps", "cm-inf", "cm-lat", "cm-age"].forEach(id => $(id).textContent = "--");
    return;
  }
  cam.textContent = m.camera_available ? "연결됨" : "오프라인";
  cam.className = m.camera_available ? "ok" : "danger";
  $("cm-fps").textContent = m.camera_fps.toFixed(1) + " fps";
  $("cm-inf").textContent = m.inference_fps.toFixed(1) + " fps";
  $("cm-lat").textContent = Math.round(m.inference_latency_ms) + " ms";
  $("cm-age").textContent = m.frame_age_ms == null ? "--" : Math.round(m.frame_age_ms) + " ms 전";
}

function renderCamEvents() {
  const list = events.filter(e => e.src === "AI 카메라").slice(0, 6);
  $("cam-events").innerHTML = list.length
    ? list.map(e => `<li><span class="badge ${e.level}">${LEVEL[e.level] || "정보"}</span><span>${esc(e.msg)}</span>
        <span class="num" style="margin-left:auto;">${timeStr(e.t)}</span></li>`).join("")
    : '<li class="muted">기록된 AI 이벤트가 없습니다</li>';
}

function cameraFullscreen() {
  const stage = $("cam-stage");
  if(stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
}

setInterval(() => {
  if(document.fullscreenElement) $("fs-clock").textContent = timeStr(Date.now());
}, 1000);

$("cam-crit-spine").textContent = SERVER_THR.spine + "°";
$("cam-crit-still").textContent = SERVER_THR.still + "초";

on("detection", renderCamDetection);
on("metrics", renderCamMetrics);
on("events", renderCamEvents);
on("settings", () => {
  $("fs-title").textContent = [settings.site, settings.zone].filter(Boolean).join(" · ") || "카메라 전체 보기";
  renderCamDetection();
  renderCamEvents();
});
