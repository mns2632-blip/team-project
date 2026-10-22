// ── 로그인 체크 ──
if (!sessionStorage.getItem("loggedIn")) window.location.href="/";
function logout() { sessionStorage.removeItem("loggedIn"); window.location.href="/"; }

// ── 페이지 전환 ──
function switchPage(el, pageId) {
  document.querySelectorAll(".subnav-item").forEach(i => i.classList.remove("active"));
  el.classList.add("active");
  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.getElementById("page-"+pageId).classList.add("active");
  if(pageId==="history") renderHistoryTable();
  if(pageId==="alerts")  renderAlertLogTable();
}

// ── 전체 이상 로그 ──
const allAlertLogs = [];

// ── 센서 이력 테이블 ──
function renderHistoryTable() {
  const tbody = document.getElementById("history-tbody");
  const len = Math.max(history.temp.length, history.humid.length, history.gas.length);
  if(!len) { tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--gray400);padding:24px;">수집된 데이터가 없습니다.</td></tr>'; return; }
  const rows = [];
  for(let i=0;i<len;i++) {
    const t=history.temp[i]||{}, h=history.humid[i]||{}, g=history.gas[i]||{};
    const tV=t.val!==undefined?t.val:'--', hV=h.val!==undefined?h.val:'--', gV=g.val!==undefined?g.val:'--';
    const worst = tV>40||hV>85||gV>500?'danger':tV>32||gV>300?'warn':'ok';
    const badge = worst==='danger'?'<span style="color:var(--red);font-weight:600;">위험</span>':worst==='warn'?'<span style="color:var(--yellow);font-weight:600;">주의</span>':'<span style="color:var(--green);">정상</span>';
    rows.push('<tr><td>'+(t.time||h.time||g.time||'--')+'</td><td>'+tV+'</td><td>'+hV+'</td><td>'+gV+'</td><td>'+badge+'</td></tr>');
  }
  tbody.innerHTML = rows.reverse().join('');
}

// ── 이상 감지 로그 테이블 ──
function renderAlertLogTable() {
  const tbody = document.getElementById("alertlog-tbody");
  if(!allAlertLogs.length) { tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--gray400);padding:24px;">이상 감지 이력이 없습니다.</td></tr>'; return; }
  tbody.innerHTML = allAlertLogs.slice().reverse().map(l => {
    const typeLabel = l.sensor==='cam'?'AI 탐지':l.sensor==='temp'?'온도':l.sensor==='humid'?'습도':'가스';
    const badge = l.type==='danger'?'<span style="color:var(--red);font-weight:600;">위험</span>':'<span style="color:var(--yellow);font-weight:600;">주의</span>';
    return '<tr><td>'+l.time+'</td><td>'+typeLabel+'</td><td>'+l.msg+'</td><td>'+badge+'</td></tr>';
  }).join('');
}

// ── 오버레이 ──
let overlayTimer = null;
function showOverlay(type, title, msg, chips) {
  if(!document.getElementById("set-overlay")?.checked) return;
  const ov = document.getElementById("alert-overlay");
  ov.className = "alert-overlay active "+type;
  document.getElementById("ov-icon").textContent  = type==='danger'?'🚨':'⚠️';
  document.getElementById("ov-title").textContent = title;
  document.getElementById("ov-msg").textContent   = msg;
  document.getElementById("ov-chips").innerHTML   = chips.map(c=>'<div class="ov-chip">'+c+'</div>').join('');
  // 진행 바 애니메이션 (8초)
  const bar = document.getElementById("ov-progress-bar");
  bar.style.transition = 'none';
  bar.style.width = '100%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bar.style.transition = 'width 8s linear';
      bar.style.width = '0%';
    });
  });
  if(overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(dismissOverlay, 8000);
}
function dismissOverlay() {
  document.getElementById("alert-overlay").classList.remove("active");
  if(overlayTimer) clearTimeout(overlayTimer);
}

// ── 설정 저장 ──
function saveSettings() { alert("설정이 저장되었습니다."); }

// ── 시계 ──
function tick() {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("ko-KR",{hour12:false});
}
tick(); setInterval(tick,1000);

// ── 데이터 ──
const history   = { temp:[], humid:[], gas:[] };
const alertLogs = { temp:[], humid:[], gas:[] };
const MAX_HIST  = 30;
let currentSensor = "temp";
let sideOpen = false;

// ── 평면도 ──
const fp = document.getElementById("floorplan");
const fctx = fp.getContext("2d");

const sensorPos = {
  temp:  { rx:0.22, ry:0.38, label:"온도", icon:"🌡", color:"#EA580C" },
  humid: { rx:0.65, ry:0.38, label:"습도", icon:"💧", color:"#0284C7" },
  gas:   { rx:0.44, ry:0.68, label:"가스", icon:"☁", color:"#7C3AED" },
  cam:   { rx:0.80, ry:0.22, label:"카메라", icon:"📷", color:"#1757C2" },
};

let sensorStatus = { temp:"ok", humid:"ok", gas:"ok", cam:"ok" };

function drawFP() {
  fp.width  = fp.parentElement.clientWidth;
  fp.height = fp.parentElement.clientHeight - 45;
  if (fp.height < 10) return;
  const W=fp.width, H=fp.height;
  fctx.clearRect(0,0,W,H);

  // 배경
  fctx.fillStyle="#F8FAFC"; fctx.fillRect(0,0,W,H);

  // 그리드
  fctx.strokeStyle="#E2E8F0"; fctx.lineWidth=1;
  for(let x=0;x<W;x+=25){fctx.beginPath();fctx.moveTo(x,0);fctx.lineTo(x,H);fctx.stroke();}
  for(let y=0;y<H;y+=25){fctx.beginPath();fctx.moveTo(0,y);fctx.lineTo(W,y);fctx.stroke();}

  // 방 외벽
  const rm = {x:W*0.08,y:H*0.12,w:W*0.84,h:H*0.76};
  fctx.fillStyle="#fff";
  fctx.fillRect(rm.x,rm.y,rm.w,rm.h);
  fctx.strokeStyle="#CBD5E1"; fctx.lineWidth=2;
  fctx.strokeRect(rm.x,rm.y,rm.w,rm.h);

  // 방 라벨
  fctx.fillStyle="#94A3B8"; fctx.font="11px Pretendard,sans-serif";
  fctx.textAlign="left";
  fctx.fillText("배터리 보관·시험 공간", rm.x+10, rm.y+16);

  // 문
  fctx.strokeStyle="#94A3B8"; fctx.lineWidth=1.5;
  const doorX = rm.x + rm.w*0.42;
  fctx.beginPath(); fctx.moveTo(doorX,rm.y); fctx.lineTo(doorX+rm.w*0.16,rm.y); fctx.stroke();
  fctx.fillStyle="#94A3B8"; fctx.font="9px Pretendard"; fctx.textAlign="center";
  fctx.fillText("출입문", doorX+rm.w*0.08, rm.y-4);

  // 배터리 박스
  const bx=rm.x+16, by=rm.y+24, bw=70, bh=50;
  fctx.fillStyle="#F1F5F9";
  fctx.fillRect(bx,by,bw,bh);
  fctx.strokeStyle="#CBD5E1"; fctx.lineWidth=1;
  fctx.strokeRect(bx,by,bw,bh);
  fctx.fillStyle="#64748B"; fctx.font="10px Pretendard"; fctx.textAlign="center";
  fctx.fillText("배터리", bx+bw/2, by+bh/2+4);

  // 중앙 허브
  const cx=rm.x+rm.w*0.5, cy=rm.y+rm.h*0.5;

  // 센서 마커
  Object.entries(sensorPos).forEach(([key,s]) => {
    const x=rm.x+rm.w*s.rx, y=rm.y+rm.h*s.ry;
    const st = sensorStatus[key];
    const c = st==="danger"?"#DC2626":st==="warn"?"#D97706":s.color;

    // 연결선
    fctx.strokeStyle=c+"33"; fctx.lineWidth=1.5;
    fctx.setLineDash([4,6]);
    fctx.beginPath(); fctx.moveTo(x,y); fctx.lineTo(cx,cy); fctx.stroke();
    fctx.setLineDash([]);

    // 글로우
    const g=fctx.createRadialGradient(x,y,0,x,y,22);
    g.addColorStop(0,c+"22"); g.addColorStop(1,"transparent");
    fctx.fillStyle=g; fctx.beginPath(); fctx.arc(x,y,22,0,Math.PI*2); fctx.fill();

    // 원
    fctx.beginPath(); fctx.arc(x,y,10,0,Math.PI*2);
    fctx.fillStyle=c; fctx.fill();
    fctx.strokeStyle="#fff"; fctx.lineWidth=2; fctx.stroke();

    // 라벨
    fctx.fillStyle=c; fctx.font="bold 10px Pretendard"; fctx.textAlign="center";
    fctx.fillText(s.label, x, y-14);

    // 값
    let v="";
    if(key==="temp")  v=document.getElementById("temp-val").textContent+"°C";
    if(key==="humid") v=document.getElementById("humid-val").textContent+"%";
    if(key==="gas")   v=document.getElementById("gas-val").textContent+"ppm";
    if(key==="cam")   v="LIVE";
    fctx.fillStyle="#64748B"; fctx.font="9px Pretendard";
    fctx.fillText(v, x, y+22);
  });

  // 허브
  fctx.beginPath(); fctx.arc(cx,cy,10,0,Math.PI*2);
  fctx.fillStyle=var2hex("--blue2","#2563EB"); fctx.fill();
  fctx.strokeStyle="#fff"; fctx.lineWidth=2; fctx.stroke();
  fctx.fillStyle="#fff"; fctx.font="bold 8px Pretendard"; fctx.textAlign="center";
  fctx.fillText("HUB", cx, cy+3);
}

function var2hex(v,fallback){ return fallback; }
setInterval(drawFP,2000); window.addEventListener("resize",drawFP); setTimeout(drawFP,100);

// ── Chart.js 메인 차트 ──
const chartColors = { temp:"#EA580C", humid:"#0284C7", gas:"#7C3AED" };
const chartLabels = { temp:"온도 (°C)", humid:"습도 (%RH)", gas:"가스 농도 (ppm)" };

const cCtx = document.getElementById("sensor-chart").getContext("2d");
const mainChart = new Chart(cCtx, {
  type:"line",
  data:{ labels:[], datasets:[{ data:[], borderColor:"#EA580C", backgroundColor:"rgba(234,88,12,0.08)", borderWidth:2, pointRadius:2, fill:true, tension:0.4 }] },
  options:{
    animation:false, responsive:true,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ ticks:{ color:"#94A3B8", font:{size:10} }, grid:{ color:"#F1F5F9" } },
      y:{ ticks:{ color:"#94A3B8", font:{size:10} }, grid:{ color:"#F1F5F9" } }
    }
  }
});

function switchChart(sensor) {
  currentSensor = sensor;
  ["temp","humid","gas"].forEach(s => {
    document.getElementById("ctab-"+s).classList.toggle("active", s===sensor);
  });
  updateMainChart(sensor);
  if(sideOpen) { updateSideChart(sensor); updateStats(sensor); }
}

function updateMainChart(sensor) {
  const h=history[sensor];
  mainChart.data.labels = h.map(d=>d.time);
  mainChart.data.datasets[0].data = h.map(d=>d.val);
  mainChart.data.datasets[0].borderColor = chartColors[sensor];
  mainChart.data.datasets[0].backgroundColor = chartColors[sensor]+"14";
  mainChart.update();
}

// ── 사이드 차트 ──
const sCtx = document.getElementById("side-chart").getContext("2d");
const sideChart = new Chart(sCtx, {
  type:"line",
  data:{ labels:[], datasets:[{ data:[], borderColor:"#EA580C", backgroundColor:"rgba(234,88,12,0.08)", borderWidth:2, pointRadius:2, fill:true, tension:0.4 }] },
  options:{
    animation:false, responsive:true,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ ticks:{ color:"#94A3B8", font:{size:9} }, grid:{ color:"#F1F5F9" } },
      y:{ ticks:{ color:"#94A3B8", font:{size:9} }, grid:{ color:"#F1F5F9" } }
    }
  }
});

function updateSideChart(sensor) {
  const h=history[sensor];
  sideChart.data.labels = h.map(d=>d.time);
  sideChart.data.datasets[0].data = h.map(d=>d.val);
  sideChart.data.datasets[0].borderColor = chartColors[sensor];
  sideChart.data.datasets[0].backgroundColor = chartColors[sensor]+"14";
  sideChart.update();
}

function updateStats(sensor) {
  const vals=history[sensor].map(d=>d.val);
  if(!vals.length) return;
  document.getElementById("stat-min").textContent = Math.min(...vals).toFixed(1);
  document.getElementById("stat-avg").textContent = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
  document.getElementById("stat-max").textContent = Math.max(...vals).toFixed(1);
}

// ── 사이드 패널 ──
const sideLabels = { temp:"온도 상세", humid:"습도 상세", gas:"가스 농도 상세" };

function openSide(sensor) {
  currentSensor = sensor;
  document.getElementById("side-title").textContent = sideLabels[sensor];
  ["temp","humid","gas"].forEach(s =>
    document.getElementById("card-"+s).classList.toggle("active", s===sensor)
  );
  document.getElementById("side-panel").classList.add("open");
  sideOpen = true;
  updateSideChart(sensor); updateStats(sensor); renderAlertList(sensor);
}

function closeSide() {
  document.getElementById("side-panel").classList.remove("open");
  sideOpen = false;
  ["temp","humid","gas"].forEach(s =>
    document.getElementById("card-"+s).classList.remove("active")
  );
}

function renderAlertList(sensor) {
  const list = document.getElementById("alert-list");
  const logs = alertLogs[sensor];
  if(!logs.length) {
    list.innerHTML='<div style="font-size:12px;color:var(--gray400);padding:8px 0;">이상 감지 이력 없음</div>';
    return;
  }
  list.innerHTML = logs.slice().reverse().map(l=>
    `<div class="alert-item">
      <div class="alert-dot ${l.type}"></div>
      <span class="alert-time">${l.time}</span>
      <span class="alert-msg ${l.type}">${l.msg}</span>
    </div>`
  ).join("");
}

// ── SocketIO ──
const socket = io();
socket.on("connect", () => {
  document.getElementById("conn-dot").style.background="var(--green)";
  document.getElementById("conn-label").textContent="서버 연결됨";
  addLog("서버 연결 성공","ok");
});
socket.on("disconnect", () => {
  document.getElementById("conn-dot").style.background="var(--red)";
  document.getElementById("conn-label").textContent="연결 끊김";
});

socket.on("sensor_update", (data) => {
  const now=new Date().toLocaleTimeString("ko-KR",{hour12:false});
  const t=data.temperature, h=data.humidity, g=data.gas;

  const push=(key,val)=>{
    history[key].push({time:now,val:parseFloat(val)});
    if(history[key].length>MAX_HIST) history[key].shift();
  };
  push("temp",t); push("humid",h); push("gas",g);

  document.getElementById("temp-val").textContent  = t.toFixed(1);
  document.getElementById("humid-val").textContent = h.toFixed(1);
  document.getElementById("gas-val").textContent   = g;

  // 상태 판정
  const tS = t>40?"danger":t>32?"warn":"ok";
  const hS = h>85||h<20?(h>85?"danger":"warn"):"ok";
  const gS = g>500?"danger":g>300?"warn":"ok";
  sensorStatus.temp=tS; sensorStatus.humid=hS; sensorStatus.gas=gS;

  setBadge("temp-badge",  tS, t>40?"위험":t>32?"주의":"정상");
  setBadge("humid-badge", hS, h>85?"위험":h<20?"주의":"정상");
  setBadge("gas-badge",   gS, g>500?"위험":g>300?"주의":"정상");

  if(t>40)       { pushAlert("temp",  `온도 위험: ${t}°C`,"danger",now); logAllAlert("temp",`온도 위험: ${t}°C`,"danger",now); }
  else if(t>32)  { pushAlert("temp",  `온도 주의: ${t}°C`,"warn",now);   logAllAlert("temp",`온도 주의: ${t}°C`,"warn",now); }
  if(h>85)       { pushAlert("humid", `고습도 위험: ${h}%RH`,"danger",now); logAllAlert("humid",`고습도 위험: ${h}%RH`,"danger",now); }
  if(g>500)      { pushAlert("gas",   `가스 위험: ${g}ppm`,"danger",now);   logAllAlert("gas",`가스 위험: ${g}ppm`,"danger",now); }
  else if(g>300) { pushAlert("gas",   `가스 주의: ${g}ppm`,"warn",now);     logAllAlert("gas",`가스 주의: ${g}ppm`,"warn",now); }

  // 오버레이 표시
  const dangerChips = [];
  if(t>40)  dangerChips.push(`🌡 온도: ${t}°C`);
  if(h>85)  dangerChips.push(`💧 습도: ${h}%RH`);
  if(g>500) dangerChips.push(`☁ 가스: ${g}ppm`);
  if(dangerChips.length>0) showOverlay('danger','위 험','환경 이상이 감지되었습니다!', dangerChips);
  else {
    const warnChips = [];
    if(t>32)  warnChips.push(`🌡 온도: ${t}°C`);
    if(h<20)  warnChips.push(`💧 습도: ${h}%RH`);
    if(g>300) warnChips.push(`☁ 가스: ${g}ppm`);
    if(warnChips.length>0) showOverlay('warn','주 의','환경 주의 수준이 감지되었습니다.', warnChips);
  }

  updateMainChart(currentSensor);
  if(sideOpen){ updateSideChart(currentSensor); updateStats(currentSensor); }
  drawFP();
});

socket.on("detection_update", (data) => {
  const banner=document.getElementById("det-banner");
  const icon=document.getElementById("det-text");
  banner.className="det-banner";
  const now2=new Date().toLocaleTimeString("ko-KR",{hour12:false});
  if(data.status.includes("쓰러짐")) {
    banner.classList.add("danger");
    icon.innerHTML="⚠ 경고 — 쓰러짐이 감지되었습니다.";
    addLog("쓰러짐 감지됨!","danger"); sensorStatus.cam="danger";
    setBadge("ai-badge","danger","위험"); document.getElementById("ai-status").textContent="위험";
    logAllAlert("cam","쓰러짐 감지됨!","danger",now2);
    addColLog("log-ai","쓰러짐 감지됨!","danger");
    showOverlay('danger','위 험','작업자 쓰러짐이 감지되었습니다!',['🤖 AI 탐지: 쓰러짐']);
  } else if(data.status.includes("정지")) {
    banner.classList.add("warn");
    icon.innerHTML="! 주의 — 장시간 정지가 감지되었습니다.";
    addLog("장시간 정지 감지","warn"); sensorStatus.cam="warn";
    setBadge("ai-badge","warn","주의"); document.getElementById("ai-status").textContent="주의";
    logAllAlert("cam","장시간 정지 감지","warn",now2);
    addColLog("log-ai","장시간 정지 감지","warn");
    showOverlay('warn','주 의','작업자 장시간 정지가 감지되었습니다.',['🤖 AI 탐지: 장시간 정지']);
  } else {
    icon.innerHTML="✅ 정상 — 이상 행동이 감지되지 않았습니다.";
    sensorStatus.cam="ok";
    setBadge("ai-badge","ok","이상 없음"); document.getElementById("ai-status").textContent="정상";
  }
});

function setBadge(id, cls, text) {
  const el=document.getElementById(id);
  el.className="sc-badge "+cls;
  el.textContent=text;
}

function logAllAlert(sensor,msg,type,time) {
  allAlertLogs.push({sensor,msg,type,time});
  if(allAlertLogs.length>200) allAlertLogs.shift();
}

function pushAlert(sensor,msg,type,time) {
  const last=alertLogs[sensor].at(-1);
  if(last&&last.msg===msg) return;
  alertLogs[sensor].push({msg,type,time});
  if(alertLogs[sensor].length>100) alertLogs[sensor].shift();
  addLog(msg, type);
  if(sideOpen&&currentSensor===sensor) renderAlertList(sensor);
}

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
    `📍 (${data.hot_pos[0]}, ${data.hot_pos[1]}) : ${data.max_temp}°C`;

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
    connChip.textContent = "🟢 Wi-Fi 연결됨";
    connChip.style.color = "#86EFAC";
    connText.textContent = "연결됨";
    connText.style.color = "var(--green)";
  } else {
    connChip.textContent = "🟡 더미 모드";
    connChip.style.color = "#FDE68A";
    connText.textContent = "더미 모드";
    connText.style.color = "var(--yellow)";
  }

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
    showOverlay('danger','위 험','배터리 발열 위험이 감지되었습니다!',
      [`🌡 최고온도: ${data.max_temp}°C`, `📍 위치: (${data.hot_pos[0]}, ${data.hot_pos[1]})`]);
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
        ${a.type==='danger'?'🔴 발열 위험':'🟡 발열 주의'} — ${a.max.toFixed(1)}°C
      </span>
      <span style="color:var(--gray500);">위치: (${a.pos[0]}, ${a.pos[1]})</span>
    </div>`).join('');
}

function addColLog(colId, msg, type) {
  const col = document.getElementById(colId);
  if (!col) return;
  // 빈 상태 메시지 제거
  const empty = col.querySelector(".alert-col-empty");
  if (empty) empty.remove();
  const now = new Date().toLocaleTimeString("ko-KR",{hour12:false});
  const el = document.createElement("div");
  el.className = "alert-col-entry";
  el.innerHTML = `<span class="alert-col-time">${now}</span><span class="alert-col-msg ${type}">${msg}</span>`;
  col.prepend(el);
  while (col.children.length > 50) col.removeChild(col.lastChild);
}

function addLog(msg,type="info") {
  const body=document.getElementById("log-body");
  const now=new Date().toLocaleTimeString("ko-KR",{hour12:false});
  const el=document.createElement("div");
  el.className="log-entry";
  el.innerHTML=`<div class="log-dot ${type}"></div><span class="log-time">${now}</span><span class="log-msg ${type}">${msg}</span>`;
  body.prepend(el);
  while(body.children.length>10) body.removeChild(body.lastChild);
}

addLog("시스템 초기화 완료","ok");
