from pathlib import Path
from urllib.parse import parse_qs

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates


router = APIRouter()
WEB_DIR = Path(__file__).resolve().parents[1]
templates = Jinja2Templates(directory=WEB_DIR / "templates")


def asset_url(path: str) -> str:
    """정적 파일 URL에 수정 시각을 붙여, 파일이 바뀌면 브라우저가 캐시 대신 새로 받게 한다."""
    try:
        version = int((WEB_DIR / "static" / path).stat().st_mtime)
    except OSError:
        version = 0
    return f"/static/{path}?v={version}"


templates.env.globals["asset_url"] = asset_url


@router.get("/")
async def login_page(request: Request):
    return templates.TemplateResponse(
        request=request, name="login.html", context={}
    )


@router.get("/dashboard")
async def dashboard(request: Request):
    if not request.session.get("authenticated"):
        return RedirectResponse("/", status_code=303)
    return templates.TemplateResponse(
        request=request, name="index.html", context={}
    )


@router.post("/login")
async def authenticate(request: Request):
    form = parse_qs((await request.body()).decode("utf-8"), keep_blank_values=True)
    username = form.get("username", [""])[0].strip()
    password = form.get("password", [""])[0]

    if username == "admin" and password and password == request.app.state.login_password:
        request.session["authenticated"] = True
        return {"success": True}

    return JSONResponse(
        {"success": False, "message": "아이디 또는 비밀번호가 올바르지 않습니다."},
        status_code=401,
    )


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return JSONResponse({}, status_code=204)
