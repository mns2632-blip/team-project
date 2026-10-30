// 센서 분석 화면: 구간 요약, 센서별 추이, 센서 간 상관, CSV 내보내기
let snRangeMin = 60;

// 센서별 추이 그래프: 실제 단위 축 + 주의·위험 임계선
const snCharts = Object.fromEntries(Object.entries(SENSORS).map(([key, s]) => [key, new Chart($("sn-chart-" + key).getContext("2d"), {
  type:"line",
  data:{ labels:[], datasets:[
    { key, label:s.label, data:[], borderColor:s.color, backgroundColor:s.color + "1A", fill:true,
      borderWidth:2, pointRadius:0, tension:0.3 },
    { key:"warn", label:"주의", data:[], borderColor:"#D97706", borderWidth:1, borderDash:[5, 4], pointRadius:0 },
    { key:"danger", label:"위험", data:[], borderColor:"#DC2626", borderWidth:1, borderDash:[5, 4], pointRadius:0 },
  ] },
  options:{
    animation:false, responsive:true, maintainAspectRatio:false,
    interaction:{ mode:"index", intersect:false },
    plugins:{
      legend:{ display:false },
      tooltip:{ filter:item => item.datasetIndex === 0,
        callbacks:{ label:ctx => `${s.label}: ${fmt(key, ctx.parsed.y)}${s.unit}` } },
    },
    scales:{
      x:{ ticks:{ color:"#71717A", maxTicksLimit:6, font:{ size:11 } }, grid:{ color:"#F4F4F5" } },
      y:{ ticks:{ color:"#71717A", callback:v => v + s.unit, font:{ size:11 } }, grid:{ color:"#F4F4F5" } },
    },
  },
})]));

const snSamples = () => state.samples.filter(s => s.t >= Date.now() - snRangeMin * 60 * 1000);

function pearson(a, b) {
  const n = a.length;
  if(n < 5) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for(let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

function renderSensors() {
  if(currentPage !== "sensors") return;
  const rows = snSamples();

  // 구간 요약 카드
  for(const key of Object.keys(SENSORS)) {
    const card = $("sn-" + key), vals = rows.map(r => r[key]), t = settings.thr[key];
    card.querySelectorAll(".sn-u").forEach(el => el.textContent = SENSORS[key].unit);
    card.querySelector(".sn-thr-warn").textContent = t.warn;
    card.querySelector(".sn-thr-danger").textContent = t.danger;
    if(!vals.length) continue;
    const max = Math.max(...vals), lv = statusOf(key, max);
    card.className = "card card-pad sn-card " + lv;
    card.querySelector(".sn-state").className = "badge sn-state " + lv;
    card.querySelector(".sn-state").textContent = LEVEL[lv];
    card.querySelector(".sn-max").textContent = fmt(key, max);
    card.querySelector(".sn-avg").textContent = fmt(key, vals.reduce((a, b) => a + b, 0) / vals.length);
    card.querySelector(".sn-min").textContent = fmt(key, Math.min(...vals));
  }

  // 센서별 추이
  const labels = rows.map(r => timeStr(r.t));
  for(const [key, chart] of Object.entries(snCharts)) {
    const t = settings.thr[key], [val, warn, danger] = chart.data.datasets;
    chart.data.labels = labels;
    val.data = rows.map(r => r[key]);
    warn.data = rows.map(() => t.warn);
    danger.data = rows.map(() => t.danger);
    chart.options.scales.y.suggestedMax = t.danger * 1.1;
    chart.update();
  }
  $("sn-span").textContent = rows.length
    ? `${timeStr(rows[0].t)} – ${timeStr(rows.at(-1).t)} · ${rows.length}회 측정 · 이 브라우저에서 대시보드를 연 뒤 수집한 값만 분석합니다`
    : "아직 수집된 값이 없습니다";

  // 센서 간 상관
  const keys = Object.keys(SENSORS), names = ["온도", "습도", "가스"];
  const cell = r => {
    if(r == null) return '<span style="background:#F4F4F5;color:#A1A1AA;">–</span>';
    const a = Math.abs(r);
    const [bg, fg] = a >= 0.7 ? [r > 0 ? "#EA580C" : "#2563EB", "#FFFFFF"]
      : a >= 0.4 ? [r > 0 ? "#FED7AA" : "#BFDBFE", "#09090B"] : ["#F4F4F5", "#52525B"];
    return `<span class="num" style="background:${bg};color:${fg};">${r.toFixed(2)}</span>`;
  };
  let html = '<span class="hd"></span>' + names.map(n => `<span class="hd">${n}</span>`).join("");
  let best = null;
  keys.forEach((a, i) => {
    html += `<span class="hd">${names[i]}</span>`;
    keys.forEach((b, j) => {
      if(i === j) { html += '<span style="background:#18181B;color:#FFFFFF;">—</span>'; return; }
      const r = pearson(rows.map(x => x[a]), rows.map(x => x[b]));
      html += cell(r);
      if(j > i && r != null && (!best || Math.abs(r) > Math.abs(best.r))) best = { r, a:names[i], b:names[j] };
    });
  });
  $("sn-corr").innerHTML = html;
  $("sn-corr-note").textContent = !best ? "측정값이 5개 이상 모이면 계산합니다."
    : Math.abs(best.r) >= 0.7 ? `${best.a}와(과) ${best.b}가 ${best.r.toFixed(2)}로 함께 움직였습니다.`
    : "구간 안에서 뚜렷하게 함께 움직인 센서는 없습니다.";

  // 구간 내 이벤트
  const since = rows[0]?.t ?? Date.now();
  const evs = events.filter(e => e.src === "환경 센서" && e.t >= since).slice(0, 8);
  $("sn-events").innerHTML = evs.length
    ? evs.map(e => `<li><span class="badge ${e.level}">${LEVEL[e.level]}</span><a href="#logs/${e.id}">${esc(e.msg)}</a>
        <span class="num" style="margin-left:auto;">${timeStr(e.t)}</span></li>`).join("")
    : '<li class="muted">구간 안에 기록된 센서 이벤트가 없습니다</li>';
}

function exportSensorCSV() {
  const rows = snSamples();
  if(!rows.length) { alert("내보낼 데이터가 없습니다."); return; }
  downloadCSV(`sensors-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["시간", "온도(°C)", "습도(%RH)", "가스(ppm)", "상태"],
    ...rows.map(r => [dateTimeStr(r.t), r.temp, r.humid, r.gas,
      LEVEL[Object.keys(SENSORS).map(k => statusOf(k, r[k])).reduce(worse, "ok")]]),
  ]);
}

$("sn-range").addEventListener("click", e => {
  const b = e.target.closest("button[data-min]");
  if(!b) return;
  snRangeMin = +b.dataset.min;
  $("sn-range").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderSensors();
});

on("sample", renderSensors);
on("page", p => { if(p === "sensors") renderSensors(); });
on("settings", renderSensors);
