// 실시간 관제 화면: 센서 카드, 평면도, 차트, 상세 패널, 영상 탐지
let currentSensor = "temp";
let sideOpen = false;

function renderThresholdLabels() {
  document.getElementById("temp-thr").textContent  = `주의 ${THR.tempWarn} · 위험 ${THR.tempDanger}°C`;
  document.getElementById("humid-thr").textContent = `주의 <${THR.humidLow} · 위험 ${THR.humidHigh}%`;
  document.getElementById("gas-thr").textContent   = `주의 ${THR.gasWarn} · 위험 ${THR.gasDanger}ppm`;
}
renderThresholdLabels();

// ── 평면도 ──
const fp = document.getElementById("floorplan");
const fctx = fp.getContext("2d");

const sensorPos = {
  temp:  { rx:0.22, ry:0.38, label:"온도", color:"#FF8A4C" },
  humid: { rx:0.65, ry:0.38, label:"습도", color:"#4FB3F0" },
  gas:   { rx:0.44, ry:0.68, label:"가스", color:"#A78BFA" },
  cam:   { rx:0.80, ry:0.22, label:"카메라", color:"#5B9CF6" },
};


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

addLog("시스템 초기화 완료","ok");
