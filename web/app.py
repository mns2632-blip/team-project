import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

import socketio
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from web.detectors.fall import FallDetector
from web.routes import register_routes
from web.services.sensors import SensorService
from web.services.thermal_camera import ThermalDetector
from web.services.video_pipeline import VideoPipeline


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

socket_server = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


class ThreadSafeSocketEmitter:
    def __init__(self, server: socketio.AsyncServer, loop: asyncio.AbstractEventLoop):
        self.server = server
        self.loop = loop

    def emit(self, event: str, data: dict) -> None:
        coroutine = self.server.emit(event, data)
        try:
            future = asyncio.run_coroutine_threadsafe(coroutine, self.loop)
        except RuntimeError:
            # 서버 종료로 이벤트 루프가 닫힌 뒤 백그라운드 스레드가 보내는 이벤트는 버린다.
            coroutine.close()
            return
        future.result(timeout=5)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        login_password = os.environ.get("LOGIN_PASSWORD")
        if not login_password:
            raise RuntimeError("LOGIN_PASSWORD must be set in the project .env file")

        app.state.login_password = login_password
        emitter = ThreadSafeSocketEmitter(socket_server, asyncio.get_running_loop())
        fall_detector = FallDetector()
        thermal_detector = ThermalDetector()
        pipeline = VideoPipeline(fall_detector, emitter)
        sensor_service = SensorService(emitter, thermal_detector)

        app.state.pipeline = pipeline
        app.state.sensor_service = sensor_service
        pipeline.start()
        sensor_service.start()
        try:
            yield
        except BaseException:
            # 강제 종료(^C 두 번)로 lifespan이 취소되면 await를 할 수 없으므로 동기로 정리한다.
            sensor_service.stop()
            pipeline.stop()
            raise
        await asyncio.to_thread(sensor_service.stop)
        await asyncio.to_thread(pipeline.stop)

    application = FastAPI(title="밀폐공간 통합 안전 관제 시스템", lifespan=lifespan)
    application.state.login_password = os.environ.get("LOGIN_PASSWORD", "")
    application.state.pipeline = None
    application.state.sensor_service = None
    application.add_middleware(
        SessionMiddleware,
        secret_key=os.environ.get("SECRET_KEY", "dev-only-change-me"),
        same_site="lax",
        https_only=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
    )
    application.mount(
        "/static",
        StaticFiles(directory=Path(__file__).resolve().parent / "static"),
        name="static",
    )
    register_routes(application)
    return application


fastapi_app = create_app()
app = socketio.ASGIApp(socket_server, other_asgi_app=fastapi_app)


@socket_server.event
async def connect(sid, environ, auth):
    pipeline = getattr(fastapi_app.state, "pipeline", None)
    if pipeline:
        await socket_server.emit(
            "detection_update", {"status": pipeline.status()}, to=sid
        )


class GracefulServer(uvicorn.Server):
    def handle_exit(self, sig, frame) -> None:
        # uvicorn은 열린 요청이 끝난 뒤에야 lifespan 종료를 실행하므로,
        # 끝나지 않는 MJPEG 스트림을 먼저 닫아야 종료가 멈추지 않는다.
        pipeline = getattr(fastapi_app.state, "pipeline", None)
        if pipeline:
            pipeline.stream.close_streams()
        super().handle_exit(sig, frame)


def main() -> None:
    config = uvicorn.Config(
        "web.app:app", host="0.0.0.0", port=5000, timeout_graceful_shutdown=3
    )
    GracefulServer(config).run()


if __name__ == "__main__":
    main()
