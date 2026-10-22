from flask import Blueprint, render_template


pages = Blueprint("pages", __name__)


@pages.get("/")
def login():
    return render_template("login.html")


@pages.get("/dashboard")
def dashboard():
    return render_template("index.html")
