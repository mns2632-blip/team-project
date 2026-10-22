import cv2
import time
import json
import threading
import serial
import serial.tools.list_ports
import os
from pathlib import Path
from flask import Flask, Response, render_template
from flask_socketio import SocketIO
from detector import FallDetector
from thermal_detector import ThermalDetector

app = Flask(__name__, template_folder=Path(__file__).resolve().parent / "templates")
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-change-me")
socketio = SocketIO(app, cors_allowed_origins="*")

detector = FallDetector()
thermal_detector = ThermalDetector()

# ─────────────────────────────────────────
# 센서 데이터 초기값
# ─────────────────────────────────────────
sensor_data = {"temperature": 0.0, "humidity": 0.0, "gas": 0}
sensor_connected = False   # ESP32 시리얼 연결 여부

# ─────────────────────────────────────────
# ESP32 포트 자동 감지
# ─────────────────────────────────────────
def find_esp32_port():
    ports = serial.tools.list_ports.comports()
    for port in ports:
        if any(k in port.description for k in ["CP210", "CH340", "UART", "USB Serial", "ESP"]):
            print(f"[OK] ESP32 포트 자동 감지: {port.device}")
            return port.device
    print("[WARN] 자동 감지 실패 → /dev/ttyUSB0 사용")
    return "/dev/ttyUSB0"

# ─────────────────────────────────────────
# ESP32 시리얼 데이터 수신
# ─────────────────────────────────────────
def read_sensor_esp32():
    global sensor_connected
    import random

    port = find_esp32_port()

    while True:
        try:
            ser = serial.Serial(port, 9600, timeout=2)
            print(f"[OK] ESP32 연결 완료 ({port})")
            sensor_connected = True

            while True:
                line = ser.readline().decode("utf-8", errors="ignore").strip()

                # 디버그 메시지 스킵
                if not line or line.startswith("["):
                    continue

                try:
                    data = json.loads(line)

                    if all(k in data for k in ["temperature", "humidity", "gas"]):
                        sensor_data["temperature"] = round(float(data["temperature"]), 1)
                        sensor_data["humidity"]    = round(float(data["humidity"]), 1)
                        sensor_data["gas"]         = int(data["gas"])
                        socketio.emit("sensor_update", sensor_data)
                        print(f"[DATA] 온도:{sensor_data['temperature']}°C  "
                              f"습도:{sensor_data['humidity']}%  "
                              f"가스:{sensor_data['gas']}ppm")

                except json.JSONDecodeError:
                    pass

        except serial.SerialException as e:
            sensor_connected = False
            print(f"[WARN] 시리얼 연결 끊김: {e} → 3초 후 재연결 (더미 모드 전환)")
            time.sleep(3)
        except Exception as e:
            sensor_connected = False
            print(f"[ERROR] {e} → 3초 후 재시도 (더미 모드 전환)")
            time.sleep(3)


def generate_dummy_sensor():
    """ESP32 미연결 시 더미 센서 데이터를 3초마다 생성"""
    import random
    print("[INFO] 환경 센서 더미 모드 시작")
    while True:
        if not sensor_connected:
            sensor_data["temperature"] = round(random.uniform(20.0, 30.0), 1)
            sensor_data["humidity"]    = round(random.uniform(40.0, 70.0), 1)
            sensor_data["gas"]         = random.randint(50, 150)
            socketio.emit("sensor_update", sensor_data)
        time.sleep(3)

# ─────────────────────────────────────────
# 라우팅
# ─────────────────────────────────────────
@app.route("/")
def login():
    return render_template("login.html")

@app.route("/dashboard")
def dashboard():
    return render_template("index.html")

# ─────────────────────────────────────────
# Logitech C920 카메라 스트리밍
# ─────────────────────────────────────────
def generate_frames():
    cap = cv2.VideoCapture(1)   # 0=내장카메라, 1=C920

    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        print("[OK] Logitech C920 연결 완료 (1280x720 @ 30fps)")
    else:
        import numpy as np
        while True:
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, "Camera Not Found", (140, 220),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (80, 80, 80), 2)
            cv2.putText(frame, "Connect Logitech C920", (120, 260),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (60, 60, 60), 1)
            _, buf = cv2.imencode(".jpg", frame)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")
            time.sleep(0.033)
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame, status = detector.detect(frame)
        socketio.emit("detection_update", {"status": status})

        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")

@app.route("/video_feed")
def video_feed():
    return Response(generate_frames(),
                    mimetype="multipart/x-mixed-replace; boundary=frame")

# ─────────────────────────────────────────
# 실행
# ─────────────────────────────────────────
# ─────────────────────────────────────────
# Waveshare ESP32-S3 열화상 데이터 수신 (Wi-Fi TCP)
# ─────────────────────────────────────────
def read_thermal():
    """Waveshare ESP32-S3 열화상 데이터를 2초 주기로 읽어 웹에 전송 (Wi-Fi TCP port 3333)"""
    while True:
        try:
            data = thermal_detector.read()
            # ESP32 센서(DHT22 + MQ) 값을 열화상 데이터에 합산하여 전송
            data["env_temperature"] = sensor_data["temperature"]
            data["env_humidity"]    = sensor_data["humidity"]
            data["env_gas"]         = sensor_data["gas"]
            socketio.emit("thermal_update", data)
            if data["status"] != "정상":
                print(f"[THERMAL] {data['status']} — 최고온도: {data['max_temp']}°C "
                      f"위치: {data['hot_pos']}")
        except Exception as e:
            print(f"[THERMAL ERROR] {e}")
        time.sleep(2)

if __name__ == "__main__":
    # ESP32 센서 스레드
    t1 = threading.Thread(target=read_sensor_esp32, daemon=True)
    t1.start()
    # 환경 센서 더미 스레드 (미연결 시 대체)
    t_dummy = threading.Thread(target=generate_dummy_sensor, daemon=True)
    t_dummy.start()
    # Waveshare ESP32-S3 열화상 스레드
    t2 = threading.Thread(target=read_thermal, daemon=True)
    t2.start()
    print("=" * 40)
    print("서버 시작: http://localhost:5000")
    print("ID: admin  /  PW: 1234")
    print("=" * 40)
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)
