import json
import threading
import time
import os
from urllib.error import URLError
from urllib.request import urlopen

import serial
import serial.tools.list_ports


class SensorService:
    def __init__(self, socketio, thermal_detector):
        self.socketio = socketio
        self.thermal_detector = thermal_detector
        self.sensor_data = {"temperature": 0.0, "humidity": 0.0, "gas": 0}
        self.sensor_connected = False
        self._stop = threading.Event()
        self._workers = []

    @staticmethod
    def find_esp32_port():
        ports = serial.tools.list_ports.comports()
        for port in ports:
            if any(
                key in port.description
                for key in ["CP210", "CH340", "UART", "USB Serial", "ESP"]
            ):
                print(f"[OK] ESP32 포트 자동 감지: {port.device}")
                return port.device
        print("[WARN] 자동 감지 실패 → /dev/ttyUSB0 사용")
        return "/dev/ttyUSB0"

    def read_sensor_esp32(self):
        port = self.find_esp32_port()

        while not self._stop.is_set():
            try:
                with serial.Serial(port, 9600, timeout=2) as ser:
                    print(f"[OK] ESP32 연결 완료 ({port})")
                    self.sensor_connected = True

                    while not self._stop.is_set():
                        line = ser.readline().decode("utf-8", errors="ignore").strip()
                        if not line or line.startswith("["):
                            continue

                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        if all(key in data for key in ["temperature", "humidity", "gas"]):
                            self.sensor_data["temperature"] = round(
                                float(data["temperature"]), 1
                            )
                            self.sensor_data["humidity"] = round(float(data["humidity"]), 1)
                            self.sensor_data["gas"] = int(data["gas"])
                            self.socketio.emit("sensor_update", self.sensor_data)
                            print(
                                f"[DATA] 온도:{self.sensor_data['temperature']}°C  "
                                f"습도:{self.sensor_data['humidity']}%  "
                                f"가스:{self.sensor_data['gas']}ppm"
                            )

            except serial.SerialException as error:
                self.sensor_connected = False
                print(f"[WARN] 시리얼 연결 끊김: {error} → 3초 후 재연결")
                self._stop.wait(3)
            except Exception as error:
                self.sensor_connected = False
                print(f"[ERROR] {error} → 3초 후 재시도")
                self._stop.wait(3)

    def read_sensor_wifi(self):
        sensor_url = os.getenv("ESP32_SENSOR_URL", "").strip()
        if not sensor_url:
            sensor_ip = os.getenv("ESP32_SENSOR_IP", "").strip()
            if sensor_ip:
                sensor_url = f"http://{sensor_ip}/"

        if not sensor_url:
            print("[WARN] ESP32_SENSOR_URL 또는 ESP32_SENSOR_IP가 설정되지 않았습니다.")
            return

        print(f"[INFO] ESP32 Wi-Fi 센서 수신 시작: {sensor_url}")
        while not self._stop.is_set():
            try:
                with urlopen(sensor_url, timeout=3) as response:
                    data = json.loads(response.read().decode("utf-8"))

                if all(key in data for key in ["temperature", "humidity", "gas"]):
                    self.sensor_data["temperature"] = round(
                        float(data["temperature"]), 1
                    )
                    self.sensor_data["humidity"] = round(
                        float(data["humidity"]), 1
                    )
                    self.sensor_data["gas"] = int(data["gas"])
                    self.sensor_connected = True
                    self.socketio.emit("sensor_update", self.sensor_data)
                    print(
                        f"[DATA] 온도:{self.sensor_data['temperature']}°C  "
                        f"습도:{self.sensor_data['humidity']}%  "
                        f"가스:{self.sensor_data['gas']}ppm"
                    )
            except (URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
                self.sensor_connected = False
                print(f"[WARN] Wi-Fi 센서 연결 끊김: {error} → 3초 후 재연결")
                self._stop.wait(3)
                continue

            self._stop.wait(2)

    def read_thermal(self):
        while not self._stop.is_set():
            try:
                data = self.thermal_detector.read()
                if data is None:
                    self.socketio.emit("thermal_update", {"connected": False})
                    self._stop.wait(2)
                    continue
                data["env_temperature"] = self.sensor_data["temperature"]
                data["env_humidity"] = self.sensor_data["humidity"]
                data["env_gas"] = self.sensor_data["gas"]
                self.socketio.emit("thermal_update", data)
                if data["status"] != "정상":
                    print(
                        f"[THERMAL] {data['status']} — 최고온도: {data['max_temp']}°C "
                        f"위치: {data['hot_pos']}"
                    )
            except Exception as error:
                print(f"[THERMAL ERROR] {error}")
            self._stop.wait(2)

    def start(self):
        if any(worker.is_alive() for worker in self._workers):
            return
        self._stop.clear()
        wifi_sensor_configured = bool(
            os.getenv("ESP32_SENSOR_URL", "").strip()
            or os.getenv("ESP32_SENSOR_IP", "").strip()
        )
        sensor_worker = self.read_sensor_wifi if wifi_sensor_configured else self.read_sensor_esp32
        workers = (
            sensor_worker,
            self.read_thermal,
        )
        for worker in workers:
            thread = threading.Thread(target=worker, daemon=True)
            self._workers.append(thread)
            thread.start()

    def stop(self):
        self._stop.set()
        for worker in self._workers:
            worker.join(timeout=5)
        self._workers.clear()
