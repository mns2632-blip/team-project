"""
thermal_detector.py
Waveshare Thermal-45 Camera ESP32-S3 모듈 — Wi-Fi TCP 연결 버전

연결 방법:
  1. 열화상 카메라 모듈에 전원 인가 (Type-C)
  2. Jetson Nano에서 모듈 Wi-Fi에 접속:
       - AP 모드: "Thermal_Camera_XXXX" SSID → IP 192.168.4.1
       - STA 모드: 공유기에 같이 연결 후 모듈 IP 확인
  3. app.py 실행 → 자동 TCP 연결

데이터 포맷 (TCP port 3333):
  전체 프레임: 10,560 bytes
    헤더 160 bytes (버림) + 실데이터 10,240 bytes + 꼬리 160 bytes (버림)
  실데이터: 80×62 = 4,960개 uint16 값
  온도 변환: °C = raw × 0.0984 − 265.82
"""

import socket
import threading
import time
import numpy as np

# ── 설정값 ────────────────────────────────────────────────────
THERMAL_IP      = "192.168.4.1"   # AP 모드 기본 IP (STA 모드면 변경)
THERMAL_PORT    = 3333
CONNECT_TIMEOUT = 5               # 초기 연결 타임아웃 (초)
RECV_TIMEOUT    = 5               # 수신 타임아웃 (초)

# 프레임 구조
FRAME_W         = 80
FRAME_H         = 62
RAW_SIZE        = FRAME_W * FRAME_H * 2   # 10,240 bytes
STRIP_HEAD      = 160
STRIP_TAIL      = 160
TCP_FRAME_SIZE  = RAW_SIZE + STRIP_HEAD + STRIP_TAIL  # 10,560 bytes

# 온도 변환 계수
RAW_SCALE       = 0.0984
RAW_OFFSET      = 265.82

# 이상 임계값
TEMP_WARN       = 45.0   # 주의 (°C)
TEMP_DANGER     = 60.0   # 위험 (°C)
# ──────────────────────────────────────────────────────────────


class ThermalDetector:
    """
    Waveshare ESP32-S3 열화상 카메라 TCP 수신기
    - Wi-Fi TCP(port 3333)로 80×62 열화상 프레임 수신
    - 실시간 최고/평균 온도 계산 및 이상 판정
    - 모듈 미연결 시 더미 데이터 모드 자동 전환
    """

    def __init__(self, ip: str = THERMAL_IP, port: int = THERMAL_PORT):
        self.ip      = ip
        self.port    = port
        self._sock   = None
        self._buf    = b""
        self._lock   = threading.Lock()
        self._dummy_t = 0

        # 최신 분석 결과 (스레드 공유용)
        self._latest = self._make_result(
            np.full((FRAME_H, FRAME_W), 25.0), connected=False
        )

        # TCP 연결 시도
        self._connected = False
        self._connect()

    # ─────────────────────────────────────
    # TCP 연결
    # ─────────────────────────────────────
    def _connect(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(CONNECT_TIMEOUT)
            s.connect((self.ip, self.port))
            s.settimeout(RECV_TIMEOUT)
            self._sock = s
            self._buf  = b""
            self._connected = True
            print(f"[OK] 열화상 카메라 TCP 연결 완료 ({self.ip}:{self.port})")
        except Exception as e:
            self._sock = None
            self._connected = False
            print(f"[INFO] 열화상 카메라 미연결 → 더미 모드 ({e})")

    def _disconnect(self):
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        self._connected = False

    # ─────────────────────────────────────
    # 프레임 1개 읽기 (내부)
    # ─────────────────────────────────────
    def _recv_frame(self) -> np.ndarray | None:
        """TCP 버퍼에서 완전한 프레임 1개를 꺼내 온도 배열로 반환"""
        try:
            # 버퍼가 충분해질 때까지 수신
            while len(self._buf) < TCP_FRAME_SIZE:
                chunk = self._sock.recv(4096)
                if not chunk:
                    raise ConnectionResetError("TCP 스트림 종료")
                self._buf += chunk

            # 헤더/꼬리 제거 후 uint16 파싱
            raw_bytes = self._buf[STRIP_HEAD: STRIP_HEAD + RAW_SIZE]
            self._buf = self._buf[TCP_FRAME_SIZE:]

            raw = np.frombuffer(raw_bytes, dtype=np.uint16)
            # 온도 변환: °C = raw × 0.0984 − 265.82
            temp_arr = raw.astype(np.float32) * RAW_SCALE - RAW_OFFSET
            return temp_arr.reshape(FRAME_H, FRAME_W)

        except Exception as e:
            print(f"[THERMAL] 수신 오류: {e}")
            self._disconnect()
            return None

    # ─────────────────────────────────────
    # 외부 호출 메서드
    # ─────────────────────────────────────
    def read(self) -> dict:
        """
        프레임 1개 읽어 분석 결과 반환.
        미연결 시 재연결 시도 후 더미 데이터 반환.
        """
        if not self._connected:
            self._connect()

        if self._connected:
            arr = self._recv_frame()
            if arr is not None:
                result = self._make_result(arr, connected=True)
                with self._lock:
                    self._latest = result
                return result
            # 수신 실패 → 더미
        return self._read_dummy()

    # ─────────────────────────────────────
    # 더미 데이터 (미연결 시)
    # ─────────────────────────────────────
    def _read_dummy(self) -> dict:
        self._dummy_t += 1
        arr = np.random.uniform(22.0, 35.0, (FRAME_H, FRAME_W)).astype(np.float32)
        # 중앙 발열점
        arr[28:34, 36:44] += np.random.uniform(5, 20)
        # 주기적 이상 온도
        if self._dummy_t % 40 == 0:
            arr[31, 40] = 65.0
        elif self._dummy_t % 20 == 0:
            arr[31, 40] = 50.0
        return self._make_result(arr, connected=False)

    # ─────────────────────────────────────
    # 온도 배열 분석 & 결과 생성
    # ─────────────────────────────────────
    def _make_result(self, arr: np.ndarray, connected: bool) -> dict:
        max_temp = float(np.max(arr))
        avg_temp = float(np.mean(arr))
        min_temp = float(np.min(arr))
        hot_r, hot_c = np.unravel_index(np.argmax(arr), arr.shape)

        # 상태 판정
        if max_temp >= TEMP_DANGER:
            status = "발열 위험"
        elif max_temp >= TEMP_WARN:
            status = "발열 주의"
        else:
            status = "정상"

        # 히트맵 정규화 (0~255, 웹 표시용)
        lo = max(float(np.min(arr)), 15.0)
        hi = min(float(np.max(arr)), 80.0)
        span = max(hi - lo, 1.0)
        heatmap = (((arr - lo) / span) * 255).clip(0, 255).astype(int).tolist()

        return {
            "connected": connected,
            "max_temp":  round(max_temp, 1),
            "avg_temp":  round(avg_temp, 1),
            "min_temp":  round(min_temp, 1),
            "hot_pos":   (int(hot_r), int(hot_c)),
            "status":    status,
            "heatmap":   heatmap,   # 62×80 중첩 리스트
            "rows":      FRAME_H,   # 62
            "cols":      FRAME_W,   # 80
        }

    # ─────────────────────────────────────
    # 설정 변경 (런타임)
    # ─────────────────────────────────────
    def set_ip(self, ip: str):
        """열화상 카메라 IP 변경 후 재연결 (STA 모드 전환 시 사용)"""
        self._disconnect()
        self.ip = ip
        print(f"[THERMAL] IP 변경 → {ip}")
        self._connect()
