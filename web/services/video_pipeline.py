import time

from web.services.camera import CameraCaptureService
from web.services.frame_buffer import FrameBuffer
from web.services.inference import InferenceService
from web.services.video_stream import VideoStreamService


class VideoPipeline:
    def __init__(self, detector, event_emitter, device: int = 0):
        self.frame_buffer = FrameBuffer()
        self.camera = CameraCaptureService(self.frame_buffer, device)
        self.inference = InferenceService(detector, self.frame_buffer, event_emitter)
        self.stream = VideoStreamService(self.frame_buffer)

    def start(self) -> None:
        self.camera.start()
        self.inference.start()
        self.stream.start()

    def stop(self) -> None:
        self.camera.stop()
        self.inference.stop()
        self.stream.stop()

    def metrics(self) -> dict[str, float | int | str | None]:
        return self.frame_buffer.metrics()

    def status(self) -> str:
        snapshot = self.frame_buffer.video_snapshot()
        if snapshot.inference is None:
            return "감지 대기 중"
        if time.monotonic() - snapshot.inference.captured_at > 1.0:
            return "감지 정보 갱신 대기"
        return snapshot.inference.result.status
