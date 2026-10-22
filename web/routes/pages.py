import hmac

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, session


pages = Blueprint("pages", __name__)


@pages.get("/")
def login():
    return render_template("login.html")


@pages.get("/dashboard")
def dashboard():
    if not session.get("authenticated"):
        return redirect("/")
    return render_template("index.html")


@pages.post("/login")
def authenticate():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    expected_password = current_app.config["LOGIN_PASSWORD"]

    if username == "admin" and hmac.compare_digest(
        password.encode("utf-8"), expected_password.encode("utf-8")
    ):
        session["authenticated"] = True
        return jsonify(success=True)

    return jsonify(success=False, message="아이디 또는 비밀번호가 올바르지 않습니다."), 401


@pages.post("/logout")
def logout():
    session.clear()
    return "", 204
