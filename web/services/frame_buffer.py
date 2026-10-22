import threading
import time
from collections import deque
from dataclasses import dataclass

import numpy as np

from web.detectors.fall import DetectionResult


@dataclass(frozen=True)
class FrameSnapshot:
    frame_id: int
    captured_at: float
    frame: np.ndarray


@dataclass(frozen=True)
class InferenceSnapshot:
    frame_id: int
    captured_at: float
    completed_at: float
    latency_ms: float
    result: DetectionResult


@dataclass(frozen=True)
class VideoSnapshot:
    frame: np.ndarray | None
    inference: InferenceSnapshot | None
    camera_available: bool


class FrameBuffer:
    """Thread-safe latest-frame and shared MJPEG buffer."""

    def __init__(self):
        self._condition = threading.Condition()
        self._frame: FrameSnapshot | None = None
        self._inference: InferenceSnapshot | None = None
        self._camera_available = False
        self._jpeg_sequence = 0
        self._jpeg: bytes | None = None
        self._camera_times = deque()
        self._inference_times = deque()
        self._stream_times = deque()
        self._inference_latency_ms = 0.0

    def publish_frame(self, frame: np.ndarray, captured_at: float | None = None) -> int:
        timestamp = time.monotonic() if captured_at is None else captured_at
        with self._condition:
            frame_id = 1 if self._frame is None else self._frame.frame_id + 1
            self._frame = FrameSnapshot(frame_id, timestamp, frame.copy())
            self._camera_available = True
            self._record_time(self._camera_times, timestamp)
            self._condition.notify_all()
            return frame_id

    def set_camera_available(self, available: bool) -> None:
        with self._condition:
            self._camera_available = available
            self._condition.notify_all()

    def wait_for_frame(self, after_frame_id: int, timeout: float) -> FrameSnapshot | None:
        with self._condition:
            self._condition.wait_for(
                lambda: self._frame is not None and self._frame.frame_id > after_frame_id,
                timeout=timeout,
            )
            if self._frame is None or self._frame.frame_id <= after_frame_id:
                return None
            return FrameSnapshot(
                self._frame.frame_id, self._frame.captured_at, self._frame.frame.copy()
            )

    def publish_inference(self, inference: InferenceSnapshot) -> None:
        with self._condition:
            self._inference = inference
            self._inference_latency_ms = inference.latency_ms
            self._record_time(self._inference_times, inference.completed_at)
            self._condition.notify_all()

    def video_snapshot(self) -> VideoSnapshot:
        with self._condition:
            frame = self._frame
            return VideoSnapshot(
                frame.frame.copy() if frame is not None else None,
                self._inference,
                self._camera_available,
            )

    def publish_jpeg(self, jpeg: bytes, timestamp: float | None = None) -> int:
        now = time.monotonic() if timestamp is None else timestamp
        with self._condition:
            self._jpeg = jpeg
            self._jpeg_sequence += 1
            self._record_time(self._stream_times, now)
            self._condition.notify_all()
            return self._jpeg_sequence

    def wait_for_jpeg(self, after_sequence: int, timeout: float) -> tuple[int, bytes] | None:
        with self._condition:
            self._condition.wait_for(
                lambda: self._jpeg is not None and self._jpeg_sequence > after_sequence,
                timeout=timeout,
            )
            if self._jpeg is None or self._jpeg_sequence <= after_sequence:
                return None
            return self._jpeg_sequence, self._jpeg

    def metrics(self) -> dict[str, float | int | str | None]:
        now = time.monotonic()
        with self._condition:
            inference = self._inference
            return {
                "camera_fps": self._fps(self._camera_times),
                "inference_fps": self._fps(self._inference_times),
                "stream_fps": self._fps(self._stream_times),
                "inference_latency_ms": round(self._inference_latency_ms, 1),
                "frame_id": self._frame.frame_id if self._frame else 0,
                "inference_frame_id": inference.frame_id if inference else 0,
                "detection_status": inference.result.status if inference else None,
                "detection_age_ms": (
                    round((now - inference.captured_at) * 1000, 1) if inference else None
                ),
                "frame_age_ms": (
                    round((now - self._frame.captured_at) * 1000, 1) if self._frame else None
                ),
                "camera_available": self._camera_available,
            }

    @staticmethod
    def _record_time(samples: deque, timestamp: float) -> None:
        samples.append(timestamp)
        while samples and timestamp - samples[0] > 2.0:
            samples.popleft()

    @staticmethod
    def _fps(samples: deque) -> float:
        if len(samples) < 2 or samples[-1] <= samples[0]:
            return 0.0
        return round((len(samples) - 1) / (samples[-1] - samples[0]), 1)
