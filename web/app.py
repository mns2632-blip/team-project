import os
from pathlib import Path

from flask import Flask
from flask_socketio import SocketIO

from web.detectors.fall import FallDetector
from web.services.sensors import SensorService
from web.services.thermal_camera import ThermalDetector
from web.routes import register_routes


def create_app():
    app = Flask(__name__, template_folder=Path(__file__).resolve().parent / "templates")
    app.secret_key = os.environ.get("SECRET_KEY", "dev-only-change-me")

    socketio = SocketIO(app, cors_allowed_origins="*")
    fall_detector = FallDetector()
    thermal_detector = ThermalDetector()
    sensor_service = SensorService(socketio, thermal_detector)

    app.extensions["socketio"] = socketio
    app.extensions["fall_detector"] = fall_detector
    app.extensions["sensor_service"] = sensor_service

    register_routes(app)
    return app


def main():
    app = create_app()
    sensor_service = app.extensions["sensor_service"]
    sensor_service.start()

    print("=" * 40)
    print("서버 시작: http://localhost:5000")
    print("ID: admin  /  PW: 1234")
    print("=" * 40)
    app.extensions["socketio"].run(app, host="0.0.0.0", port=5000, debug=False)
