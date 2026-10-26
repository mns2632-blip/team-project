// 열화상 카메라 화면
// ── 열화상 카메라 처리 ──
const thermalCanvas = document.getElementById("thermal-canvas");
const thermalCtx = thermalCanvas?.getContext("2d");
const thAlertHistory = [];

// 색상 매핑: 파랑(0) → 청록 → 초록 → 노랑 → 빨강(255) 4단계 그라데이션
function thermalColor(val) {
  // 0~63: 파랑→청록, 64~127: 청록→초록→노랑, 128~191: 노랑→주황, 192~255: 주황→빨강
  let r, g, b;
  if (val < 64) {
    r = 0; g = val * 2; b = 255;
  } else if (val < 128) {
    r = 0; g = 128 + (val - 64); b = 255 - (val - 64) * 4;
  } else if (val < 192) {
    r = (val - 128) * 4; g = 255 - (val - 128) * 2; b = 0;
  } else {
    r = 255; g = Math.max(0, 128 - (val - 192) * 2); b = 0;
  }
  return [r, g, b];
}

socket.on("thermal_update", (data) => {
  const now = new Date().toLocaleTimeString("ko-KR", {hour12:false});

  // ── 열화상 전용 페이지 업데이트 ──
  document.getElementById("th-max-val").textContent = data.max_temp.toFixed(1);
  document.getElementById("th-avg-val").textContent = data.avg_temp.toFixed(1);
  document.getElementById("th-min-val").textContent = data.min_temp.toFixed(1);
  document.getElementById("th-hot-row").textContent = data.hot_pos[0];
  document.getElementById("th-hot-col").textContent = data.hot_pos[1];
  document.getElementById("thermal-hotspot").textContent =
    `(${data.hot_pos[0]}, ${data.hot_pos[1]}) : ${data.max_temp}°C`;

  // 환경 센서값 (ESP32 DHT22 + MQ)
  if (data.env_temperature !== undefined) {
    document.getElementById("th-env-temp").textContent  = data.env_temperature.toFixed(1);
    document.getElementById("th-env-humid").textContent = data.env_humidity.toFixed(1);
    document.getElementById("th-env-gas").textContent   = data.env_gas;
  }

  // 연결 상태 칩
  const connChip = document.getElementById("th-conn-chip");
  const connText = document.getElementById("th-conn-text");
  if (data.connected) {
    connChip.textContent = "Wi-Fi 연결됨";
    setDev("thermal","ok","연결됨");
    connChip.style.color = "#86EFAC";
    connText.textContent = "연결됨";
    connText.style.color = "var(--green)";
  } else {
    connChip.textContent = "더미 모드";
    setDev("thermal","warn","더미 모드");
    connChip.style.color = "#FDE68A";
    connText.textContent = "더미 모드";
    connText.style.color = "var(--yellow)";
  }

  // 메인 KPI + 종합 상태
  const thSt = data.status==="발열 위험"?"danger":data.status==="발열 주의"?"warn":"ok";
  document.getElementById("kpi-th-val").textContent = data.max_temp.toFixed(1);
  setBadge("kpi-th-badge", thSt, data.status);
  setMeter("kpi-th-meter", data.max_temp, 60, thSt);
  thermalStatus = thSt; thermalLabel = "열화상 발열";
  updateStatusBanner();

  // 페이지 배지
  const pageBadge   = document.getElementById("th-page-badge");
  const maxBadge    = document.getElementById("th-max-badge");
  pageBadge.className = "thermal-badge";
  pageBadge.textContent = data.status;
  maxBadge.textContent  = data.status;
  maxBadge.className    = "sc-badge";
  if (data.status === "발열 위험") {
    pageBadge.classList.add("danger");
    maxBadge.classList.add("danger");
    // 로그 + 오버레이
    addLog(`열화상: 발열 위험 — ${data.max_temp}°C`, "danger");
    addColLog("log-thermal", `발열 위험 — ${data.max_temp}°C 위치(${data.hot_pos[0]},${data.hot_pos[1]})`, "danger");
    showOverlay('danger','위험 경보','배터리 발열 위험 감지',
      [`최고온도: ${data.max_temp}°C`, `위치: (${data.hot_pos[0]}, ${data.hot_pos[1]})`]);
    pushThAlert(data, "danger", now);
  } else if (data.status === "발열 주의") {
    pageBadge.classList.add("warn");
    maxBadge.classList.add("warn");
    addLog(`열화상: 발열 주의 — ${data.max_temp}°C`, "warn");
    addColLog("log-thermal", `발열 주의 — ${data.max_temp}°C`, "warn");
    pushThAlert(data, "warn", now);
  } else {
    pageBadge.classList.add("ok");
    maxBadge.classList.add("ok");
  }

  // ── 히트맵 캔버스 그리기 ──
  if (thermalCtx && data.heatmap) {
    const cols = data.cols, rows = data.rows;
    const imageData = thermalCtx.createImageData(cols, rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = data.heatmap[r][c];
        const idx = (r * cols + c) * 4;
        const [R, G, B] = thermalColor(val);
        imageData.data[idx]   = R;
        imageData.data[idx+1] = G;
        imageData.data[idx+2] = B;
        imageData.data[idx+3] = 255;
      }
    }
    thermalCtx.putImageData(imageData, 0, 0);
  }
});

function pushThAlert(data, type, time) {
  thAlertHistory.unshift({ type, time,
    max: data.max_temp, pos: data.hot_pos });
  if (thAlertHistory.length > 20) thAlertHistory.pop();
  renderThAlertList();
}

function renderThAlertList() {
  const el = document.getElementById("th-alert-list");
  if (!thAlertHistory.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;font-size:11px;color:var(--gray400);">이상 없음</div>';
    return;
  }
  el.innerHTML = thAlertHistory.map(a => `
    <div style="padding:8px 12px;border-bottom:1px solid var(--gray100);font-size:11px;display:flex;flex-direction:column;gap:2px;">
      <span style="color:var(--gray400);">${a.time}</span>
      <span style="font-weight:500;color:${a.type==='danger'?'var(--red)':'var(--yellow)'};">
        ${a.type==='danger'?'발열 위험':'발열 주의'} — ${a.max.toFixed(1)}°C
      </span>
      <span style="color:var(--gray500);">위치: (${a.pos[0]}, ${a.pos[1]})</span>
    </div>`).join('');
}
