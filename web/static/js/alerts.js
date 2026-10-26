// 이상 감지 로그 화면
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
