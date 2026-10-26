// ── 로그아웃 ──
async function logout() {
  await fetch("/logout", {method:"POST"});
  window.location.href = "/";
}

// ── 페이지 전환 ──
function goPage(pageId) {
  const el=[...document.querySelectorAll(".subnav-item")].find(i=>i.getAttribute("onclick").includes("'"+pageId+"'"));
  if(el) switchPage(el,pageId);
}
function switchPage(el, pageId) {
  document.querySelectorAll(".subnav-item").forEach(i => i.classList.remove("active"));
  el.classList.add("active");
  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.getElementById("page-"+pageId).classList.add("active");
  if(pageId==="history") renderHistoryTable();
  if(pageId==="monitor") setTimeout(drawFP,0);
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
    const worst = [statusOf('temp',tV),statusOf('humid',hV),statusOf('gas',gV)].reduce(worse,'ok');
    const badge = worst==='danger'?'<span style="color:var(--red);font-weight:600;">위험</span>':worst==='warn'?'<span style="color:var(--yellow);font-weight:600;">주의</span>':'<span style="color:var(--green);">정상</span>';
    rows.push('<tr><td>'+(t.time||h.time||g.time||'--')+'</td><td>'+tV+'</td><td>'+hV+'</td><td>'+gV+'</td><td>'+badge+'</td></tr>');
  }
  tbody.innerHTML = rows.reverse().join('');
}

// ── 임계값 (시스템 설정에서 변경, 브라우저에 저장) ──
const THR = { tempWarn:32, tempDanger:40, humidHigh:85, humidLow:20, gasWarn:300, gasDanger:500, overlay:true };
const THR_FIELDS = { tempWarn:"set-temp-warn", tempDanger:"set-temp-danger", humidHigh:"set-humid-high", humidLow:"set-humid-low", gasWarn:"set-gas-warn", gasDanger:"set-gas-danger" };
try { Object.assign(THR, JSON.parse(localStorage.getItem("thresholds")||"{}")); } catch {}
Object.entries(THR_FIELDS).forEach(([k,id]) => { document.getElementById(id).value = THR[k]; });
document.getElementById("set-overlay").checked = THR.overlay;

function statusOf(sensor, v) {
  if(typeof v!=="number") return "ok";
  if(sensor==="temp")  return v>THR.tempDanger?"danger":v>THR.tempWarn?"warn":"ok";
  if(sensor==="humid") return v>THR.humidHigh?"danger":v<THR.humidLow?"warn":"ok";
  return v>THR.gasDanger?"danger":v>THR.gasWarn?"warn":"ok";
}
const RANK = {ok:0, warn:1, danger:2};
function worse(a,b){ return RANK[b]>RANK[a]?b:a; }

function renderThresholdLabels() {
  document.getElementById("temp-thr").textContent  = `주의 ${THR.tempWarn} · 위험 ${THR.tempDanger}°C`;
  document.getElementById("humid-thr").textContent = `주의 <${THR.humidLow} · 위험 ${THR.humidHigh}%`;
  document.getElementById("gas-thr").textContent   = `주의 ${THR.gasWarn} · 위험 ${THR.gasDanger}ppm`;
}
renderThresholdLabels();

function setMeter(id, val, max, st) {
  const el=document.getElementById(id);
  el.style.width = Math.max(0, Math.min(100, val/max*100))+"%";
  el.className = st==="ok"?"":st;
}

function saveSettings() {
  Object.entries(THR_FIELDS).forEach(([k,id]) => {
    const v=parseFloat(document.getElementById(id).value);
    if(!isNaN(v)) THR[k]=v;
  });
  THR.overlay = document.getElementById("set-overlay").checked;
  try { localStorage.setItem("thresholds", JSON.stringify(THR)); } catch {}
  renderThresholdLabels();
  const msg=document.getElementById("settings-msg");
  msg.textContent="저장했습니다. 이 브라우저에만 적용됩니다.";
  setTimeout(()=>{ msg.textContent=""; }, 4000);
}

// ── 경보: 위험은 확인할 때까지 모달, 주의는 8초 토스트 ──
const ICON_ALERT = document.getElementById("ov-icon").innerHTML;
let overlayTimer = null, elapsedTimer = null, alarmSince = 0, alarmKey = "";
const ackedUntil = {};   // 같은 경보를 확인 후 30초간 다시 띄우지 않음

function showOverlay(type, title, msg, chips) {
  if(!THR.overlay) return;
  const ov = document.getElementById("alert-overlay");
  const isModal = ov.classList.contains("modal");
  if(type==="danger") {
    if((ackedUntil[msg]||0) > Date.now()) return;
  } else if(isModal) return;   // 위험 경보가 떠 있으면 주의는 덮어쓰지 않음
  ov.className = "alert-overlay active "+type+(type==="danger"?" modal":"");
  document.getElementById("ov-icon").innerHTML  = ICON_ALERT;
  document.getElementById("ov-title").textContent = title;
  document.getElementById("ov-msg").textContent   = msg;
  document.getElementById("ov-chips").innerHTML   = chips.map(c=>'<div class="ov-chip">'+c+'</div>').join('');
  if(overlayTimer) clearTimeout(overlayTimer);

  if(type==="danger") {
    if(!isModal || alarmKey!==msg) { alarmSince = Date.now(); alarmKey = msg; }
    document.getElementById("ov-backdrop").classList.add("active");
    document.body.classList.add("alarm");
    const tickElapsed = () => {
      const sec=Math.floor((Date.now()-alarmSince)/1000);
      document.getElementById("ov-elapsed").textContent =
        "경과 "+String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");
    };
    tickElapsed();
    if(!elapsedTimer) elapsedTimer = setInterval(tickElapsed, 1000);
    if(!isModal) document.getElementById("ov-ack").focus();
    return;
  }
  document.getElementById("ov-elapsed").textContent = "";
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
  overlayTimer = setTimeout(dismissOverlay, 8000);
}
function ackOverlay() {
  ackedUntil[alarmKey] = Date.now() + 30000;
  addLog("경보 확인: "+alarmKey, "info");
  dismissOverlay();
}
function dismissOverlay() {
  document.getElementById("alert-overlay").classList.remove("active","modal");
  document.getElementById("ov-backdrop").classList.remove("active");
  document.body.classList.remove("alarm");
  if(overlayTimer) clearTimeout(overlayTimer);
  if(elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
}
document.addEventListener("keydown", e => {
  if(e.key==="Escape" && !document.getElementById("alert-overlay").classList.contains("modal")) dismissOverlay();
});

// ── 종합 상태 배너 ──
let thermalStatus = "ok", thermalLabel = "";
const STATUS_TAG = {ok:"정상", warn:"주의", danger:"위험"};
function updateStatusBanner() {
  const issues = { danger:[], warn:[] };
  const names = { temp:"온도", humid:"습도", gas:"가스", cam:"AI 탐지" };
  Object.entries(sensorStatus).forEach(([k,st]) => { if(st!=="ok") issues[st].push(names[k]); });
  if(thermalStatus!=="ok") issues[thermalStatus].push(thermalLabel);
  const level = issues.danger.length?"danger":issues.warn.length?"warn":"ok";
  document.getElementById("status-banner").className = "status-banner "+level;
  document.getElementById("status-tag").textContent = STATUS_TAG[level];
  document.getElementById("status-text").textContent =
    level==="ok" ? "모든 항목이 정상 범위입니다."
    : [...issues.danger.map(n=>n+" 위험"), ...issues.warn.map(n=>n+" 주의")].join(" · ")+" — 현장을 확인하세요.";
}

// ── 장치 연결 상태 ──
function setDev(key, st, text) {
  document.getElementById("dev-"+key).className = "dev-dot "+st;
  document.getElementById("dev-"+key+"-val").textContent = text;
}
let lastSensorAt = 0;
setInterval(() => {
  if(!lastSensorAt) return;
  const age = Math.round((Date.now()-lastSensorAt)/1000);
  setDev("sensor", age<10?"ok":"danger", age<10?"수신 중":age+"초 끊김");
}, 1000);

async function pollMetrics() {
  try {
    const r = await fetch("/metrics");
    if(!r.ok) throw 0;
    const m = await r.json();
    setDev("cam", m.camera_available?"ok":"danger", m.camera_available?Math.round(m.camera_fps)+" fps":"오프라인");
    document.getElementById("cam-fps").textContent =
      `카메라 ${Math.round(m.camera_fps)} fps · 추론 ${Math.round(m.inference_fps)} fps`;
  } catch { setDev("cam", "danger", "확인 불가"); }
}
pollMetrics(); setInterval(pollMetrics, 5000);

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
  temp:  { rx:0.22, ry:0.38, label:"온도", color:"#FF8A4C" },
  humid: { rx:0.65, ry:0.38, label:"습도", color:"#4FB3F0" },
  gas:   { rx:0.44, ry:0.68, label:"가스", color:"#A78BFA" },
  cam:   { rx:0.80, ry:0.22, label:"카메라", color:"#5B9CF6" },
};

let sensorStatus = { temp:"ok", humid:"ok", gas:"ok", cam:"ok" };

function drawFP() {
  fp.width  = fp.parentElement.clientWidth;
  fp.height = fp.parentElement.clientHeight - 45;
  if (fp.height < 10) return;
  const W=fp.width, H=fp.height;
  fctx.clearRect(0,0,W,H);

  // 배경
  fctx.fillStyle="#0E1116"; fctx.fillRect(0,0,W,H);

  // 그리드
  fctx.strokeStyle="#161B22"; fctx.lineWidth=1;
  for(let x=0;x<W;x+=25){fctx.beginPath();fctx.moveTo(x,0);fctx.lineTo(x,H);fctx.stroke();}
  for(let y=0;y<H;y+=25){fctx.beginPath();fctx.moveTo(0,y);fctx.lineTo(W,y);fctx.stroke();}

  // 방 외벽
  const rm = {x:W*0.08,y:H*0.12,w:W*0.84,h:H*0.76};
  fctx.fillStyle="#161B22";
  fctx.fillRect(rm.x,rm.y,rm.w,rm.h);
  fctx.strokeStyle="#2E3744"; fctx.lineWidth=2;
  fctx.strokeRect(rm.x,rm.y,rm.w,rm.h);

  // 방 라벨
  fctx.fillStyle="#94A3B8"; fctx.font="11px 'IBM Plex Sans KR',sans-serif";
  fctx.textAlign="left";
  fctx.fillText("배터리 보관·시험 공간", rm.x+10, rm.y+16);

  // 문
  fctx.strokeStyle="#94A3B8"; fctx.lineWidth=1.5;
  const doorX = rm.x + rm.w*0.42;
  fctx.beginPath(); fctx.moveTo(doorX,rm.y); fctx.lineTo(doorX+rm.w*0.16,rm.y); fctx.stroke();
  fctx.fillStyle="#94A3B8"; fctx.font="9px 'IBM Plex Sans KR'"; fctx.textAlign="center";
  fctx.fillText("출입문", doorX+rm.w*0.08, rm.y-4);

  // 배터리 박스
  const bx=rm.x+16, by=rm.y+24, bw=70, bh=50;
  fctx.fillStyle="#1B222C";
  fctx.fillRect(bx,by,bw,bh);
  fctx.strokeStyle="#2E3744"; fctx.lineWidth=1;
  fctx.strokeRect(bx,by,bw,bh);
  fctx.fillStyle="#9AA4B2"; fctx.font="10px 'IBM Plex Sans KR'"; fctx.textAlign="center";
  fctx.fillText("배터리", bx+bw/2, by+bh/2+4);

  // 중앙 허브
  const cx=rm.x+rm.w*0.5, cy=rm.y+rm.h*0.5;

  // 센서 마커
  Object.entries(sensorPos).forEach(([key,s]) => {
    const x=rm.x+rm.w*s.rx, y=rm.y+rm.h*s.ry;
    const st = sensorStatus[key];
    const c = st==="danger"?"#F2545B":st==="warn"?"#F2A93B":s.color;

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
    fctx.strokeStyle="#161B22"; fctx.lineWidth=2; fctx.stroke();

    // 라벨
    fctx.fillStyle=c; fctx.font="bold 10px 'IBM Plex Sans KR'"; fctx.textAlign="center";
    fctx.fillText(s.label, x, y-14);

    // 값
    let v="";
    if(key==="temp")  v=document.getElementById("temp-val").textContent+"°C";
    if(key==="humid") v=document.getElementById("humid-val").textContent+"%";
    if(key==="gas")   v=document.getElementById("gas-val").textContent+"ppm";
    if(key==="cam")   v="LIVE";
    fctx.fillStyle="#9AA4B2"; fctx.font="9px 'IBM Plex Sans KR'";
    fctx.fillText(v, x, y+22);
  });

  // 허브
  fctx.beginPath(); fctx.arc(cx,cy,10,0,Math.PI*2);
  fctx.fillStyle="#5B9CF6"; fctx.fill();
  fctx.strokeStyle="#161B22"; fctx.lineWidth=2; fctx.stroke();
  fctx.fillStyle="#071426"; fctx.font="bold 8px 'IBM Plex Sans KR'"; fctx.textAlign="center";
  fctx.fillText("HUB", cx, cy+3);
}

setInterval(drawFP,2000); window.addEventListener("resize",drawFP); setTimeout(drawFP,100);

// ── Chart.js 메인 차트 ──
const chartColors = { temp:"#FF8A4C", humid:"#4FB3F0", gas:"#A78BFA" };
const chartLabels = { temp:"온도 (°C)", humid:"습도 (%RH)", gas:"가스 농도 (ppm)" };

const cCtx = document.getElementById("sensor-chart").getContext("2d");
const mainChart = new Chart(cCtx, {
  type:"line",
  data:{ labels:[], datasets:[
    { data:[], borderColor:"#FF8A4C", backgroundColor:"rgba(255,138,76,0.08)", borderWidth:2, pointRadius:2, fill:true, tension:0.4 },
    { data:[], borderColor:"#F2A93B", borderWidth:1, borderDash:[5,4], pointRadius:0, fill:false }
  ] },
  options:{
    animation:false, responsive:true,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ ticks:{ color:"#7D8794", font:{size:10} }, grid:{ color:"#232A33" } },
      y:{ ticks:{ color:"#7D8794", font:{size:10} }, grid:{ color:"#232A33" } }
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
  const lim = {temp:THR.tempWarn, humid:THR.humidHigh, gas:THR.gasWarn}[sensor];
  mainChart.data.datasets[1].data = h.map(()=>lim);
  mainChart.data.datasets[1].label = sensor==="humid"?"위험 기준":"주의 기준";
  mainChart.data.datasets[1].borderColor = sensor==="humid"?"#F2545B":"#F2A93B";
  mainChart.update();
}

// ── 사이드 차트 ──
const sCtx = document.getElementById("side-chart").getContext("2d");
const sideChart = new Chart(sCtx, {
  type:"line",
  data:{ labels:[], datasets:[{ data:[], borderColor:"#FF8A4C", backgroundColor:"rgba(255,138,76,0.08)", borderWidth:2, pointRadius:2, fill:true, tension:0.4 }] },
  options:{
    animation:false, responsive:true,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ ticks:{ color:"#7D8794", font:{size:9} }, grid:{ color:"#232A33" } },
      y:{ ticks:{ color:"#7D8794", font:{size:9} }, grid:{ color:"#232A33" } }
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
  setDev("server","ok","연결됨");
  addLog("서버 연결 성공","ok");
});
socket.on("disconnect", () => {
  document.getElementById("conn-dot").style.background="var(--red)";
  document.getElementById("conn-label").textContent="연결 끊김";
  setDev("server","danger","끊김");
});

socket.on("sensor_update", (data) => {
  const now=new Date().toLocaleTimeString("ko-KR",{hour12:false});
  lastSensorAt = Date.now();
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
  const tS = statusOf("temp",t), hS = statusOf("humid",h), gS = statusOf("gas",g);
  sensorStatus.temp=tS; sensorStatus.humid=hS; sensorStatus.gas=gS;

  setBadge("temp-badge",  tS, STATUS_TAG[tS]);
  setBadge("humid-badge", hS, STATUS_TAG[hS]);
  setBadge("gas-badge",   gS, STATUS_TAG[gS]);
  setMeter("temp-meter",  t, THR.tempDanger, tS);
  setMeter("humid-meter", h, THR.humidHigh, hS);
  setMeter("gas-meter",   g, THR.gasDanger, gS);

  if(tS!=="ok") { const m=`온도 ${STATUS_TAG[tS]}: ${t}°C`; pushAlert("temp",m,tS,now); logAllAlert("temp",m,tS,now); }
  if(hS!=="ok") { const m=(hS==="danger"?"고습도 위험":"저습도 주의")+`: ${h}%RH`; pushAlert("humid",m,hS,now); logAllAlert("humid",m,hS,now); }
  if(gS!=="ok") { const m=`가스 ${STATUS_TAG[gS]}: ${g}ppm`; pushAlert("gas",m,gS,now); logAllAlert("gas",m,gS,now); }

  // 경보 표시
  const chips = st => [["온도",t,"°C",tS],["습도",h,"%RH",hS],["가스",g,"ppm",gS]]
    .filter(c=>c[3]===st).map(c=>`${c[0]}: ${c[1]}${c[2]}`);
  if(chips("danger").length) showOverlay('danger','위험 경보','환경 이상이 감지되었습니다', chips("danger"));
  else if(chips("warn").length) showOverlay('warn','주의','환경 주의 수준이 감지되었습니다.', chips("warn"));

  updateStatusBanner();
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
    icon.textContent="위험 — 쓰러짐이 감지되었습니다.";
    addLog("쓰러짐 감지됨!","danger"); sensorStatus.cam="danger";
    setBadge("ai-badge","danger"); document.getElementById("ai-status").textContent="쓰러짐";
    logAllAlert("cam","쓰러짐 감지됨!","danger",now2);
    addColLog("log-ai","쓰러짐 감지됨!","danger");
    showOverlay('danger','위험 경보','작업자 쓰러짐 감지',['AI 탐지: 쓰러짐']);
  } else if(data.status.includes("정지")) {
    banner.classList.add("warn");
    icon.textContent="주의 — 장시간 정지가 감지되었습니다.";
    addLog("장시간 정지 감지","warn"); sensorStatus.cam="warn";
    setBadge("ai-badge","warn"); document.getElementById("ai-status").textContent="장시간 정지";
    logAllAlert("cam","장시간 정지 감지","warn",now2);
    addColLog("log-ai","장시간 정지 감지","warn");
    showOverlay('warn','주의','작업자 장시간 정지가 감지되었습니다.',['AI 탐지: 장시간 정지']);
  } else {
    icon.textContent=data.status==="정상"?"정상 — 이상 행동이 감지되지 않았습니다.":data.status;
    sensorStatus.cam="ok";
    setBadge("ai-badge","ok",""); document.getElementById("ai-badge").innerHTML='AI <span id="ai-status">'+(data.status==="정상"?"정상":data.status)+'</span>';
  }
  updateStatusBanner();
});

function setBadge(id, cls, text) {
  const el=document.getElementById(id);
  el.className="sc-badge "+cls;
  if(id==="ai-badge") { el.innerHTML='AI <span id="ai-status"></span>'; return; }
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
  addColLog("log-sensor", msg, type);
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
