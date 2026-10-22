import threading

import cv2

from web.services.frame_buffer import FrameBuffer


class CameraCaptureService:
    def __init__(self, frame_buffer: FrameBuffer, device: int = 0):
        self.frame_buffer = frame_buffer
        self.device = device
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="camera-capture", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop.is_set():
            capture = cv2.VideoCapture(self.device, cv2.CAP_V4L2)
            if not capture.isOpened():
                capture.release()
                self.frame_buffer.set_camera_available(False)
                print(f"[WARN] 카메라 /dev/video{self.device}를 열 수 없습니다. 2초 후 재시도")
                self._stop.wait(2)
                continue

            capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            print(f"[OK] 카메라 연결 완료 (/dev/video{self.device}, 640x480)")
            try:
                while not self._stop.is_set():
                    ok, frame = capture.read()
                    if not ok:
                        self.frame_buffer.set_camera_available(False)
                        print("[WARN] 카메라 프레임 읽기 실패. 장치 재연결을 시도합니다.")
                        break
                    self.frame_buffer.publish_frame(frame)
            finally:
                capture.release()

            if not self._stop.is_set():
                self._stop.wait(1)
