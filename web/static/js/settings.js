// 시스템 설정 화면: 임계값 입력 (브라우저에 저장)
const THR_FIELDS = { tempWarn:"set-temp-warn", tempDanger:"set-temp-danger", humidHigh:"set-humid-high", humidLow:"set-humid-low", gasWarn:"set-gas-warn", gasDanger:"set-gas-danger" };
Object.entries(THR_FIELDS).forEach(([k,id]) => { document.getElementById(id).value = THR[k]; });
document.getElementById("set-overlay").checked = THR.overlay;

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
