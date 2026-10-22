import cv2
import time
import numpy as np
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent

# ── MediaPipe 버전별 호환 처리 ──
MEDIAPIPE_OK  = False
MEDIAPIPE_NEW = False   # True = 0.10.x 이상 신버전

try:
    import mediapipe as mp
    # 구버전 방식 테스트
    _ = mp.solutions.pose
    MEDIAPIPE_OK  = True
    MEDIAPIPE_NEW = False
    print("[INFO] MediaPipe 구버전 감지 (solutions API)")
except AttributeError:
    try:
        import mediapipe as mp
        MEDIAPIPE_OK  = True
        MEDIAPIPE_NEW = True
        print("[INFO] MediaPipe 신버전 감지 (tasks API)")
    except ImportError:
        print("[WARN] MediaPipe 미설치 — 바운딩박스만 사용")
except ImportError:
    print("[WARN] MediaPipe 미설치 — 바운딩박스만 사용")

# ── YOLOv8 ──
YOLO_OK = False
try:
    from ultralytics import YOLO
    YOLO_OK = True
except ImportError:
    print("[WARN] YOLOv8 미설치 — pip install ultralytics")


class FallDetector:
    """
    YOLOv8 + MediaPipe 기반 쓰러짐 감지기
    - YOLOv8  : 사람 바운딩박스 탐지
    - MediaPipe: 33개 관절 추출 → 척추 벡터 기울기 계산
    - 바운딩박스 종횡비 + 척추 기울기 + 장시간 정지로 이상 판정
    """

    FALL_RATIO_THRESHOLD  = 1.2   # 바운딩박스 가로/세로 비율
    SPINE_ANGLE_THRESHOLD = 45    # 척추 기울기 각도 (도)
    STILL_TIME_THRESHOLD  = 5.0   # 장시간 정지 기준 (초)

    def __init__(self):
        self.model           = None
        self.pose            = None
        self.status          = "정상"
        self.last_positions  = {}
        self.still_since     = {}

        # YOLOv8 초기화
        if YOLO_OK:
            try:
                self.model = YOLO(str(WEB_DIR / "yolov8n.pt"))
                print("[OK] YOLOv8 로드 완료")
            except Exception as e:
                print(f"[WARN] YOLOv8 로드 실패: {e}")

        # MediaPipe 초기화
        if MEDIAPIPE_OK:
            if not MEDIAPIPE_NEW:
                self._init_pose_legacy()
            else:
                self._init_pose_new()

    # ─────────────────────────────────────
    # MediaPipe 초기화 (구버전 0.9.x 이하)
    # ─────────────────────────────────────
    def _init_pose_legacy(self):
        try:
            self.mp_pose_module = mp.solutions.pose
            self.pose = self.mp_pose_module.Pose(
                static_image_mode=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
            print("[OK] MediaPipe Pose (구버전) 로드 완료")
        except Exception as e:
            print(f"[WARN] MediaPipe Pose 초기화 실패: {e}")
            self.pose = None

    # ─────────────────────────────────────
    # MediaPipe 초기화 (신버전 0.10.x 이상)
    # ─────────────────────────────────────
    def _init_pose_new(self):
        try:
            import urllib.request
            model_path = WEB_DIR / "pose_landmarker_lite.task"
            if not model_path.exists():
                print("[INFO] pose_landmarker 모델 다운로드 중...")
                url = ("https://storage.googleapis.com/mediapipe-models/"
                       "pose_landmarker/pose_landmarker_lite/float16/1/"
                       "pose_landmarker_lite.task")
                urllib.request.urlretrieve(url, str(model_path))
                print("[OK] 모델 다운로드 완료")

            BaseOptions           = mp.tasks.BaseOptions
            PoseLandmarker        = mp.tasks.vision.PoseLandmarker
            PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
            VisionRunningMode     = mp.tasks.vision.RunningMode

            options = PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(model_path)),
                running_mode=VisionRunningMode.IMAGE
            )
            self.pose = PoseLandmarker.create_from_options(options)
            print("[OK] MediaPipe Pose (신버전) 로드 완료")
        except Exception as e:
            print(f"[WARN] MediaPipe 신버전 초기화 실패: {e}")
            print("[INFO] 포즈 감지 없이 바운딩박스 비율만 사용합니다.")
            self.pose = None

    # ─────────────────────────────────────
    # 메인 탐지 함수 (web/app.py에서 호출)
    # ─────────────────────────────────────
    def detect(self, frame):
        if self.model is None:
            return self._no_model_frame(frame), "YOLOv8 미설치"

        results = self.model(frame, classes=[0], verbose=False)
        status  = "정상"

        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                person_roi = frame[y1:y2, x1:x2]
                if person_roi.size == 0:
                    continue

                w = x2 - x1
                h = y2 - y1 if (y2 - y1) > 0 else 1

                # 판정 1: 바운딩박스 종횡비
                ratio      = w / h
                ratio_fall = ratio > self.FALL_RATIO_THRESHOLD

                # 판정 2: 척추 기울기 (MediaPipe 있을 때만)
                spine_fall = self._check_spine(person_roi) if self.pose else False

                # 판정 3: 장시간 정지
                pid        = f"{(x1+x2)//2}_{(y1+y2)//2}"
                center     = ((x1 + x2) // 2, (y1 + y2) // 2)
                still_fall = self._check_still(pid, center)

                # 최종 판정 및 색상
                if ratio_fall or spine_fall:
                    status = "쓰러짐 감지!"
                    color  = (0, 0, 255)
                    label  = f"FALL  ratio:{ratio:.2f}"
                elif still_fall:
                    status = "장시간 정지 감지!"
                    color  = (0, 165, 255)
                    label  = "STILL DETECTED"
                else:
                    color  = (0, 255, 0)
                    label  = f"OK  {ratio:.2f}"

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, label, (x1, max(y1 - 8, 14)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

        self.status = status
        self._draw_status(frame, status)
        return frame, status

    # ─────────────────────────────────────
    # 척추 기울기 계산
    # ─────────────────────────────────────
    def _check_spine(self, roi):
        try:
            rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
            h, w = roi.shape[:2]

            if not MEDIAPIPE_NEW:
                # 구버전
                res = self.pose.process(rgb)
                if not res.pose_landmarks:
                    return False
                lm       = res.pose_landmarks.landmark
                shoulder = ((lm[11].x + lm[12].x) / 2 * w,
                            (lm[11].y + lm[12].y) / 2 * h)
                hip      = ((lm[23].x + lm[24].x) / 2 * w,
                            (lm[23].y + lm[24].y) / 2 * h)
            else:
                # 신버전
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                res    = self.pose.detect(mp_img)
                if not res.pose_landmarks:
                    return False
                lm       = res.pose_landmarks[0]
                shoulder = ((lm[11].x + lm[12].x) / 2 * w,
                            (lm[11].y + lm[12].y) / 2 * h)
                hip      = ((lm[23].x + lm[24].x) / 2 * w,
                            (lm[23].y + lm[24].y) / 2 * h)

            dx    = hip[0] - shoulder[0]
            dy    = hip[1] - shoulder[1]
            if abs(dy) < 1:
                return False
            angle = abs(np.degrees(np.arctan2(dx, dy)))
            return angle > self.SPINE_ANGLE_THRESHOLD

        except Exception:
            return False

    # ─────────────────────────────────────
    # 장시간 정지 판정
    # ─────────────────────────────────────
    def _check_still(self, pid, center):
        prev = self.last_positions.get(pid)
        now  = time.time()

        if prev is None:
            self.last_positions[pid] = center
            self.still_since[pid]    = now
            return False

        dist = float(np.sqrt((center[0]-prev[0])**2 + (center[1]-prev[1])**2))
        if dist < 20:
            return (now - self.still_since.get(pid, now)) > self.STILL_TIME_THRESHOLD
        else:
            self.last_positions[pid] = center
            self.still_since[pid]    = now
            return False

    # ─────────────────────────────────────
    # 화면 오버레이
    # ─────────────────────────────────────
    def _draw_status(self, frame, status):
        color = (0, 0, 255) if "감지" in status else (0, 255, 80)
        cv2.rectangle(frame, (0, 0), (360, 36), (0, 0, 0), -1)
        cv2.putText(frame, f"STATUS: {status}", (8, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    def _no_model_frame(self, frame):
        cv2.putText(frame, "pip install ultralytics",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                    0.65, (0, 100, 255), 2)
        return frame
