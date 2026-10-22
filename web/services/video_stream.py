import threading
import time

import cv2
import numpy as np

from web.services.frame_buffer import FrameBuffer


class VideoStreamService:
    def __init__(self, frame_buffer: FrameBuffer, target_fps: float = 30.0):
        self.frame_buffer = frame_buffer
        self.interval = 1.0 / target_fps
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="video-encoder", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)

    def iter_mjpeg(self):
        sequence = 0
        while not self._stop.is_set():
            snapshot = self.frame_buffer.wait_for_jpeg(sequence, timeout=1.0)
            if snapshot is None:
                continue
            sequence, jpeg = snapshot
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"

    def _run(self) -> None:
        deadline = time.monotonic()
        offline = self._offline_frame()

        while not self._stop.is_set():
            now = time.monotonic()
            if now < deadline and self._stop.wait(deadline - now):
                break
            deadline = max(deadline + self.interval, time.monotonic())

            snapshot = self.frame_buffer.video_snapshot()
            frame = snapshot.frame if snapshot.frame is not None else offline.copy()
            inference = snapshot.inference
            if not snapshot.camera_available:
                cv2.putText(
                    frame,
                    "Camera Not Found",
                    (140, 220),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (80, 80, 80),
                    2,
                )
            elif inference and now - inference.captured_at <= 1.0:
                for box in inference.result.boxes:
                    cv2.rectangle(frame, (box.x1, box.y1), (box.x2, box.y2), box.color, 2)
                    cv2.putText(
                        frame,
                        box.label,
                        (box.x1, max(box.y1 - 8, 14)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        box.color,
                        2,
                    )
                self._draw_status(frame, inference.result.status)
            elif inference:
                self._draw_status(frame, "감지 정보 갱신 대기")

            ok, encoded = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85]
            )
            if ok:
                self.frame_buffer.publish_jpeg(encoded.tobytes(), time.monotonic())

    @staticmethod
    def _offline_frame() -> np.ndarray:
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(
            frame,
            "Camera Not Found",
            (140, 220),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (80, 80, 80),
            2,
        )
        cv2.putText(
            frame,
            "Connect camera to /dev/video0",
            (120, 260),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (60, 60, 60),
            1,
        )
        return frame

    @staticmethod
    def _draw_status(frame: np.ndarray, status: str) -> None:
        color = (0, 0, 255) if "감지" in status else (0, 255, 80)
        cv2.rectangle(frame, (0, 0), (360, 36), (0, 0, 0), -1)
        cv2.putText(frame, f"STATUS: {status}", (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
