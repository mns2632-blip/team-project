# 밀폐공간 통합 안전 관제 시스템

IoT 센서와 AI 카메라로 밀폐공간의 **환경 이상**(온도·습도·가스·발열)과 **작업자 이상행동**(쓰러짐·장시간 정지)을 실시간으로 감지하는 웹 관제 대시보드입니다.

## 구성

| 구분 | 장비 / 기술 | 역할 |
|---|---|---|
| 영상 | Logitech C920 + YOLOv8n + MediaPipe Pose | 사람 탐지, 쓰러짐·장시간 정지 판정 |
| 환경 센서 | ESP32 + DHT22 + MQ-2/MQ-135 | 온도·습도·가스 측정 → USB 시리얼(JSON) 전송 |
| 서버 | FastAPI + Uvicorn + python-socketio | 비동기 웹 서버, 영상 스트리밍, 센서 데이터 실시간 전송 |
| 대시보드 | HTML + Socket.IO + Chart.js | 실시간 모니터링 화면 |

센서나 카메라가 연결되지 않아도 **더미 데이터 모드**로 자동 전환되어 대시보드를 확인할 수 있습니다.

## 폴더 구조

```
.
├── web/
│   ├── __main__.py         ← python -m web 실행 진입점
│   ├── app.py              ← FastAPI 앱, ASGI Socket.IO 및 서비스 수명 관리
│   ├── routes/             ← 웹 페이지·영상 스트림·성능 지표 라우트
│   ├── services/           ← 카메라 캡처·추론·스트림·센서 수집 서비스
│   ├── detectors/          ← AI 감지 로직
│   ├── models/             ← AI 모델 파일 (Git 제외)
│   └── templates/          ← 로그인·관제 화면
├── pyproject.toml          ← Python 프로젝트 및 의존성 설정
├── uv.lock                 ← 잠금된 의존성 버전
├── requirements.txt
├── .env.example            ← 로그인 환경변수 견본
└── esp32_sensor/
    ├── platformio.ini      ← PlatformIO 보드·라이브러리·시리얼 설정
    ├── src/main.cpp        ← ESP32 환경 센서 펌웨어
    └── include/secrets.example.h ← Wi-Fi 설정 견본
```

## 처음 세팅

### 1. 서버 실행 (uv)

```bash
# uv 설치: https://docs.astral.sh/uv/getting-started/installation/
cp .env.example .env
# .env 파일에서 LOGIN_PASSWORD를 원하는 비밀번호로 변경
uv sync
uv run python -m web
```

브라우저에서 http://localhost:5000 접속

- 로그인 아이디는 `admin`이며, 비밀번호는 `.env`의 `LOGIN_PASSWORD`로 관리합니다.
- `/dashboard`와 카메라 스트림은 로그인 후 사용할 수 있습니다.
- `/metrics`에서 인증된 사용자는 카메라·추론·송출 FPS와 프레임/추론 지연을 확인할 수 있습니다.
- 카메라 캡처, AI 추론(초당 최대 6회), JPEG 송출(초당 최대 30회)은 분리 실행됩니다. 각 스트림 접속자는 같은 최신 프레임과 공통 JPEG를 공유합니다.
- AI 모델 파일(`yolov8n.pt`, `pose_landmarker_lite.task`)은 `web/models/`에 저장되며, 없으면 실행 시 자동 다운로드됩니다. (Git에는 포함하지 않음)
- `uv sync`는 `.venv`에 잠금된 의존성을 설치하고, `uv run`은 해당 환경에서 앱을 실행합니다.

pip으로 설치해야 하는 환경에서는 `pip install -r requirements.txt` 후 `python -m web`로 실행할 수 있습니다.

### 2. 카메라 번호 확인

현재 확인된 카메라는 `/dev/video0`이며 640×480으로 스트리밍합니다. 다른 카메라 장치를 사용한다면 `web/services/video_pipeline.py`의 `VideoPipeline`에 장치 번호를 전달하도록 변경하세요.

### 3. ESP32 환경 센서 (선택)

1. VS Code에 **PlatformIO IDE** 확장을 설치하고 `esp32_sensor` 폴더를 엽니다.
2. `include/secrets.example.h`를 같은 폴더의 `include/secrets.h`로 복사하고 본인 Wi-Fi 정보를 입력합니다. `secrets.h`는 Git에서 제외됩니다.
   - `WIFI_STATIC_IP`에 ESP32에 할당할 고정 IP를 입력합니다.
   - 라우터의 게이트웨이, 서브넷 마스크, DNS와 일치하도록 나머지 주소도 설정합니다.
3. ESP32를 USB로 연결하고 PlatformIO의 **Build** → **Upload**를 실행합니다. 필요한 라이브러리는 자동으로 설치됩니다.
4. **Monitor**에서 Wi-Fi 연결 상태와 ESP32 IP, 센서 JSON 출력을 확인합니다. 서버를 실행하기 전에는 Monitor를 닫아 시리얼 포트를 해제합니다.

기본 보드는 **ESP32 Dev Module (`esp32dev`)**입니다. 다른 보드를 사용하면 `platformio.ini`의 `board`를 변경하세요. 포트는 자동 감지하며, 필요하면 `upload_port`와 `monitor_port`를 해당 파일에 지정할 수 있습니다.

PlatformIO 터미널에서는 다음 명령도 사용할 수 있습니다.

```bash
pio run
pio run --target upload
pio device monitor
```

`web/services/sensors.py`가 ESP32 포트(CP210x, CH340 등)를 자동으로 찾습니다. 펌웨어·PlatformIO 모니터·서버의 시리얼 속도는 **9600**입니다.

Wi-Fi로 센서 데이터를 수신하려면 `.env`의 `ESP32_SENSOR_URL`에 ESP32의 HTTP 주소를 설정하세요.

```env
ESP32_SENSOR_URL=http://192.168.0.50/
```

Wi-Fi 주소가 설정된 경우에는 USB 시리얼 대신 해당 주소를 2초 간격으로 조회합니다.

**배선**

| 센서 | 핀 | ESP32 |
|---|---|---|
| DHT22 | VCC / DATA / GND | 3.3V / GPIO4 / GND |
| MQ-2·MQ-135 | VCC / AO / GND | 5V / GPIO34 / GND |

## 환경변수

| 이름 | 설명 | 기본값 |
|---|---|---|
| `LOGIN_PASSWORD` | 관리자 로그인 비밀번호 (`.env`에 필수 설정) | 기본값 없음 |
| `SECRET_KEY` | 로그인 세션 서명 키. 운영 환경에서는 강력하고 고유한 값을 설정 | 개발용 기본값 |
| `COOKIE_SECURE` | HTTPS 환경에서 세션 쿠키에 Secure 플래그 적용 (`true`/`false`) | `false` |

```bash
.env 파일에서 LOGIN_PASSWORD 값을 원하는 비밀번호로 변경하세요.

# 랜덤 세션 키 생성 (선택)
python -c "import secrets; print(secrets.token_hex(32))"

# Linux / Jetson
export SECRET_KEY="생성한 값"

# Windows PowerShell
$env:SECRET_KEY="생성한 값"
```

## 감지 기준 조정

**쓰러짐 감지** (`web/detectors/fall.py`)

```python
FALL_RATIO_THRESHOLD  = 1.2   # 바운딩박스 가로/세로 비율
SPINE_ANGLE_THRESHOLD = 45    # 척추 기울기 각도 (도)
STILL_TIME_THRESHOLD  = 5.0   # 장시간 정지 판정 (초)
```

## Jetson Nano 이식

1. JetPack SDK 설치 (NVIDIA 공식 사이트)
2. PyTorch가 uv 기본 설치본으로 대체되지 않도록 나머지 의존성을 먼저 설치합니다.
   ```bash
   uv sync --no-install-package torch --no-install-package torchvision
   ```
3. Jetson 호환 PyTorch wheel을 `.venv`에 설치합니다.
   ```bash
   uv pip install --python .venv/bin/python <Jetson용 PyTorch wheel>
   ```
4. 자동 동기화가 기존 PyTorch를 바꾸지 않도록 실행합니다.
   ```bash
   uv run --no-sync python -m web
   ```

## 참고

- 로그인 비밀번호는 서버에서 검증하지만 아이디는 `admin`으로 고정되어 있습니다. 실제 운영 전에는 계정 관리와 HTTPS 등 추가 보안 설정을 적용하세요.
- Wi-Fi 설정 파일을 Git에 커밋하지 마세요.
