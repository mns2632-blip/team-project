// 공통: 페이지 전환, 임계값, 경보, 종합 상태, 장치 연결, 소켓
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

// ── 임계값 (시스템 설정에서 변경, 브라우저에 저장) ──
const THR = { tempWarn:32, tempDanger:40, humidHigh:85, humidLow:20, gasWarn:300, gasDanger:500, overlay:true };
try { Object.assign(THR, JSON.parse(localStorage.getItem("thresholds")||"{}")); } catch {}

function statusOf(sensor, v) {
  if(typeof v!=="number") return "ok";
  if(sensor==="temp")  return v>THR.tempDanger?"danger":v>THR.tempWarn?"warn":"ok";
  if(sensor==="humid") return v>THR.humidHigh?"danger":v<THR.humidLow?"warn":"ok";
  return v>THR.gasDanger?"danger":v>THR.gasWarn?"warn":"ok";
}
const RANK = {ok:0, warn:1, danger:2};
function worse(a,b){ return RANK[b]>RANK[a]?b:a; }

function setMeter(id, val, max, st) {
  const el=document.getElementById(id);
  el.style.width = Math.max(0, Math.min(100, val/max*100))+"%";
  el.className = st==="ok"?"":st;
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

let sensorStatus = { temp:"ok", humid:"ok", gas:"ok", cam:"ok" };

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

function addLog(msg,type="info") {
  const body=document.getElementById("log-body");
  const now=new Date().toLocaleTimeString("ko-KR",{hour12:false});
  const el=document.createElement("div");
  el.className="log-entry";
  el.innerHTML=`<div class="log-dot ${type}"></div><span class="log-time">${now}</span><span class="log-msg ${type}">${msg}</span>`;
  body.prepend(el);
  while(body.children.length>10) body.removeChild(body.lastChild);
}
