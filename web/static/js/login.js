// 로그인 화면
document.getElementById("login-form").addEventListener("submit", e => { e.preventDefault(); doLogin(); });
async function doLogin() {
  const id  = document.getElementById("username").value.trim();
  const pw  = document.getElementById("password").value;
  const err = document.getElementById("error-msg");
  if (!id || !pw) { err.textContent = "아이디와 비밀번호를 입력해주세요."; return; }

  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  try {
    const response = await fetch("/login", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({username: id, password: pw})
    });
    const result = await response.json();
    if (response.ok && result.success) {
      window.location.href = "/dashboard";
    } else {
      err.textContent = result.message;
      document.getElementById("password").value = "";
    }
  } catch {
    err.textContent = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
    document.getElementById("password").value = "";
  } finally {
    btn.disabled = false;
  }
}
