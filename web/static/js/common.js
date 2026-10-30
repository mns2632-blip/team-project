// 공통: 설정, 이벤트 저장소, 화면 전환, 소켓, 장치 상태, 위험 배너

// ── 설정 (시스템 설정 화면에서 변경, 이 브라우저에 저장) ──
const DEFAULT_SETTINGS = {
  site: "",
  zone: "",
  thr: {
    temp:  { warn:32,  danger:40 },
    humid: { warn:80,  danger:85 },
    gas:   { warn:300, danger:500 },
  },
  dangerBar: true,
};
// 서버(detectors/fall.py, services/thermal_camera.py)에 고정된 판정 기준
const SERVER_THR = { spine:45, still:5, thermalWarn:45, thermalDanger:60 };

const settings = structuredClone(DEFAULT_SETTINGS);
try {
  const saved = JSON.parse(localStorage.getItem("settings.v2") || "{}");
  Object.assign(settings, saved, { thr: { ...settings.thr, ...(saved.thr || {}) } });
} catch {}
function saveSettingsToStorage() {
  try { localStorage.setItem("settings.v2", JSON.stringify(settings)); } catch {}
}

const SENSORS = {
  temp:  { label:"온도",      unit:"°C",  color:"#2563EB", digits:1 },
  humid: { label:"습도",      unit:"%RH", color:"#0D9488", digits:1 },
  gas:   { label:"가스 농도", unit:"ppm", color:"#EA580C", digits:0 },
};
const LEVEL = { ok:"정상", warn:"주의", danger:"위험" };
const RANK = { ok:0, warn:1, danger:2 };
const worse = (a, b) => RANK[b] > RANK[a] ? b : a;

function statusOf(key, v) {
  const t = settings.thr[key];
  if(typeof v !== "number" || !t) return "ok";
  return v > t.danger ? "danger" : v > t.warn ? "warn" : "ok";
}
const fmt = (key, v) => typeof v === "number" ? v.toFixed(SENSORS[key].digits) : "--";
// 시각은 14:32:08 형식으로 고정 (ko-KR 로케일은 "14시 32분 8초"로 표시됨)
const pad2 = n => String(n).padStart(2, "0");
const timeStr = d => { const x = new Date(d); return `${pad2(x.getHours())}:${pad2(x.getMinutes())}:${pad2(x.getSeconds())}`; };
const dateTimeStr = d => { const x = new Date(d); return `${x.getFullYear()}.${pad2(x.getMonth() + 1)}.${pad2(x.getDate())} ${timeStr(x)}`; };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

// ── 간단한 이벤트 버스: 화면별 스크립트가 구독 ──
const bus = {};
function on(name, fn) { (bus[name] ||= []).push(fn); }
function emit(name, data) { (bus[name] || []).forEach(fn => fn(data)); }

// ── 실시간 상태 ──
const state = {
  samples: [],            // { t, temp, humid, gas } — 페이지를 연 뒤 수집한 값
  status: { temp:"ok", humid:"ok", gas:"ok", cam:"ok", thermal:"ok" },
  detection: "감지 대기 중",
  thermal: null,
  metrics: null,
  startedAt: Date.now(),
};
const MAX_SAMPLES = 1200;   // 3초 주기 기준 약 1시간

// ── 이상 감지 이벤트 (이 브라우저에 저장) ──
let events = [];
try { events = JSON.parse(localStorage.getItem("events.v1") || "[]"); } catch {}
function saveEvents() {
  try { localStorage.setItem("events.v1", JSON.stringify(events.slice(0, 500))); } catch {}
}
function eventId(t) {
  const d = new Date(t);
  const day = d.getFullYear() + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0");
  const n = events.filter(e => e.id.startsWith("EVT-" + day)).length + 1;
  return "EVT-" + day + "-" + String(n).padStart(4, "0");
}
function addEvent(level, src, msg) {
  const t = Date.now();
  const last = state.samples.at(-1) || {};
  const ev = { id:eventId(t), t, level, src, msg,
    status: level === "info" ? "done" : "open",
    snapshot: { temp:last.temp, humid:last.humid, gas:last.gas },
    memo:"", cause:"", history:[{ t, msg:"자동 감지" }] };
  events.unshift(ev);
  saveEvents();
  emit("events", ev);
  return ev;
}
function updateEvent(id, patch, note) {
  const ev = events.find(e => e.id === id);
  if(!ev) return;
  Object.assign(ev, patch);
  if(note) ev.history.push({ t:Date.now(), msg:note });
  saveEvents();
  emit("events");
}
const isOpen = e => e.status === "open" || e.status === "active";

// 상태가 나빠지는 순간에만 이벤트를 남김 (같은 상태가 계속되면 중복 기록 안 함)
function trackLevel(key, level, src, msg) {
  const prev = state.status[key];
  state.status[key] = level;
  if(RANK[level] > RANK[prev]) addEvent(level, src, msg);
}

// ── 종합 상태 ──
function overall() {
  const names = { temp:"온도", humid:"습도", gas:"가스 농도", cam:"작업자", thermal:"열화상 발열" };
  const issues = Object.entries(state.status).filter(([, s]) => s !== "ok")
    .sort((a, b) => RANK[b[1]] - RANK[a[1]]);
  const level = issues.reduce((acc, [, s]) => worse(acc, s), "ok");
  const reason = level === "ok" ? "모든 센서와 작업자 상태가 안전 범위입니다"
    : issues.map(([k, s]) => names[k] + " " + LEVEL[s]).join(" · ");
  return { level, reason };
}

// ── 화면 전환 (#hash 기반) ──
let currentPage = "monitor";
function showPage(page) {
  if(!$("page-" + page)) page = "monitor";
  currentPage = page;
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  document.querySelectorAll(".nav-item").forEach(a =>
    a.dataset.page === page ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  // 보이는 화면의 영상만 스트림 연결 (MJPEG 연결 수 절약)
  document.querySelectorAll("img[data-stream]").forEach(img => {
    const visible = img.closest(".page")?.id === "page-" + page;
    if(visible && !img.getAttribute("src")) img.src = "/video_feed";
    if(!visible && img.getAttribute("src")) img.removeAttribute("src");
  });
  emit("page", page);
}
function routeFromHash() {
  const [page, arg] = location.hash.slice(1).split("/");
  showPage(page || "monitor");
  if(arg) emit("route-arg", { page, arg });
}
window.addEventListener("hashchange", routeFromHash);

// ── 장치 연결 표시 ──
function setDev(key, level, text) {
  $("dev-" + key).className = "dot " + level;
  const v = $("dev-" + key + "-val");
  v.className = "dev-val " + level;
  v.textContent = text;
}

let lastSensorAt = 0;
setInterval(() => {
  if(!lastSensorAt) return;
  const age = Math.round((Date.now() - lastSensorAt) / 1000);
  setDev("sensor", age < 10 ? "ok" : "danger", age < 10 ? "수신 중" : age + "초 끊김");
}, 1000);

async function pollMetrics() {
  try {
    const r = await fetch("/metrics");
    if(!r.ok) throw new Error(r.status);
    state.metrics = await r.json();
    const m = state.metrics;
    setDev("cam", m.camera_available ? "ok" : "danger", m.camera_available ? "연결" : "오프라인");
  } catch {
    state.metrics = null;
    setDev("cam", "danger", "확인 불가");
  }
  emit("metrics", state.metrics);
}

// ── 위험 배너 ──
let dangerDismissedFor = "";
function renderDangerBar() {
  const open = events.filter(e => isOpen(e) && e.level === "danger");
  const show = settings.dangerBar && open.length > 0 && dangerDismissedFor !== open[0].id;
  $("danger-bar").hidden = !show;
  // 배너를 닫으면 테두리도 함께 끄고, 새 위험 이벤트가 오면 둘 다 다시 켬
  document.body.classList.toggle("alarm", show);
  if(show) {
    $("danger-bar-text").textContent = `위험 이벤트 ${open.length}건 처리 필요 · ${open[0].msg}`;
    $("danger-bar-link").href = "#logs/" + open[0].id;
  }
  const openCount = events.filter(isOpen).length;
  const badge = $("nav-open-count");
  badge.hidden = openCount === 0;
  badge.textContent = openCount;
  badge.classList.toggle("danger", open.length > 0);
}
function dismissDangerBar() {
  const open = events.find(e => isOpen(e) && e.level === "danger");
  dangerDismissedFor = open ? open.id : "";
  renderDangerBar();
}
on("events", renderDangerBar);

// ── 소켓 ──
const socket = io();
socket.on("connect", () => setDev("server", "ok", "연결"));
socket.on("disconnect", () => {
  setDev("server", "danger", "끊김");
  addEvent("warn", "시스템", "관제 서버 연결 끊김");
});

socket.on("sensor_update", data => {
  lastSensorAt = Date.now();
  const s = { t:lastSensorAt, temp:+data.temperature, humid:+data.humidity, gas:+data.gas };
  state.samples.push(s);
  if(state.samples.length > MAX_SAMPLES) state.samples.shift();
  for(const key of Object.keys(SENSORS)) {
    const lv = statusOf(key, s[key]);
    trackLevel(key, lv, "환경 센서",
      `${SENSORS[key].label} ${fmt(key, s[key])}${SENSORS[key].unit} — ${LEVEL[lv]} 기준 초과`);
  }
  emit("sample", s);
  emit("status");
});

socket.on("detection_update", data => {
  state.detection = data.status;
  const lv = data.status.includes("쓰러짐") ? "danger" : data.status.includes("정지") ? "warn" : "ok";
  trackLevel("cam", lv, "AI 카메라", lv === "danger" ? "작업자 쓰러짐 감지" : "작업자 장시간 정지 감지");
  emit("detection", data.status);
  emit("status");
});

socket.on("thermal_update", data => {
  state.thermal = data;
  setDev("thermal", data.connected ? "ok" : "warn", data.connected ? "연결" : "더미 모드");
  const lv = data.status === "발열 위험" ? "danger" : data.status === "발열 주의" ? "warn" : "ok";
  trackLevel("thermal", lv, "열화상", `${data.status} — 최고 ${data.max_temp}°C (${data.hot_pos[0]}, ${data.hot_pos[1]})`);
  emit("thermal", data);
  emit("status");
});

// ── CSV 내보내기 공통 ──
function downloadCSV(filename, rows) {
  const csv = "﻿" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── 영상 스냅샷 ──
function saveSnapshot(img) {
  if(!img || !img.naturalWidth) { alert("영상이 아직 수신되지 않았습니다."); return; }
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = "snapshot-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png";
  a.click();
}

async function logout() {
  await fetch("/logout", { method:"POST" });
  window.location.href = "/";
}

// 화면별 스크립트가 모두 구독한 뒤 시작
window.addEventListener("DOMContentLoaded", () => {
  routeFromHash();
  renderDangerBar();
  pollMetrics();
  setInterval(pollMetrics, 5000);
  emit("settings");
});
