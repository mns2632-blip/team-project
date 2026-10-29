// 열화상 화면: 히트맵, 최고/평균/최저 온도, 발열 이벤트
const thermalCtx = $("thermal-canvas").getContext("2d");

// 파랑(0) → 청록 → 초록 → 노랑 → 빨강(255)
function thermalColor(val) {
  if(val < 64)  return [0, val * 2, 255];
  if(val < 128) return [0, 128 + (val - 64), 255 - (val - 64) * 4];
  if(val < 192) return [(val - 128) * 4, 255 - (val - 128) * 2, 0];
  return [255, Math.max(0, 128 - (val - 192) * 2), 0];
}

function renderThermal(d) {
  $("th-max").textContent = d.max_temp.toFixed(1);
  $("th-avg").textContent = d.avg_temp.toFixed(1);
  $("th-min").textContent = d.min_temp.toFixed(1);
  $("th-hot").textContent = `(${d.hot_pos[0]}, ${d.hot_pos[1]}) : ${d.max_temp}°C`;
  $("th-conn").textContent = d.connected ? "Wi-Fi 연결됨" : "더미 모드";
  const lv = state.status.thermal, badge = $("th-status");
  badge.className = "badge " + lv;
  badge.textContent = d.status;

  if(d.heatmap) {
    const img = thermalCtx.createImageData(d.cols, d.rows);
    for(let r = 0; r < d.rows; r++) for(let c = 0; c < d.cols; c++) {
      const [R, G, B] = thermalColor(d.heatmap[r][c]), i = (r * d.cols + c) * 4;
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
    }
    thermalCtx.putImageData(img, 0, 0);
  }
}

function renderThermalEvents() {
  const list = events.filter(e => e.src === "열화상").slice(0, 10);
  $("th-events").innerHTML = list.length
    ? list.map(e => `<li><span class="badge ${e.level}">${LEVEL[e.level]}</span><a href="#logs/${e.id}">${esc(e.msg)}</a>
        <span class="num" style="margin-left:auto;">${timeStr(e.t)}</span></li>`).join("")
    : '<li class="muted">기록된 발열 이벤트가 없습니다</li>';
}

$("th-thr").textContent = `주의 ${SERVER_THR.thermalWarn} · 위험 ${SERVER_THR.thermalDanger}°C (서버 기준)`;
on("thermal", renderThermal);
on("events", renderThermalEvents);
on("settings", renderThermalEvents);
