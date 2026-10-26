// 센서 이력 화면
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
