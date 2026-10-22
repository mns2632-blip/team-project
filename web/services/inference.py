import threading
import time

from web.services.frame_buffer import FrameBuffer, InferenceSnapshot


class InferenceService:
    def __init__(self, detector, frame_buffer: FrameBuffer, event_emitter, target_fps: float = 6.0):
        self.detector = detector
        self.frame_buffer = frame_buffer
        self.event_emitter = event_emitter
        self.interval = 1.0 / target_fps
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_status: str | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="ai-inference", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)

    def _run(self) -> None:
        last_frame_id = 0
        last_started_at = 0.0

        while not self._stop.is_set():
            snapshot = self.frame_buffer.wait_for_frame(last_frame_id, timeout=0.2)
            if snapshot is None:
                continue

            remaining = self.interval - (time.monotonic() - last_started_at)
            if remaining > 0 and self._stop.wait(remaining):
                break

            last_frame_id = snapshot.frame_id
            last_started_at = time.monotonic()
            try:
                result = self.detector.analyze(snapshot.frame)
                completed_at = time.monotonic()
                inference = InferenceSnapshot(
                    frame_id=snapshot.frame_id,
                    captured_at=snapshot.captured_at,
                    completed_at=completed_at,
                    latency_ms=(completed_at - last_started_at) * 1000,
                    result=result,
                )
                self.frame_buffer.publish_inference(inference)
                if result.status != self._last_status:
                    self.event_emitter.emit("detection_update", {"status": result.status})
                    self._last_status = result.status
            except Exception as error:
                completed_at = time.monotonic()
                print(f"[INFERENCE ERROR] {error}")
                self.frame_buffer.publish_inference(
                    InferenceSnapshot(
                        snapshot.frame_id,
                        snapshot.captured_at,
                        completed_at,
                        (completed_at - last_started_at) * 1000,
                        self.detector_error_result(str(error)),
                    )
                )

    def detector_error_result(self, error: str):
        from web.detectors.fall import DetectionResult

        return DetectionResult(f"AI 탐지 오류: {error}")
