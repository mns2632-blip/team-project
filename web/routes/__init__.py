from fastapi import FastAPI

from web.routes.pages import router as pages_router
from web.routes.video import router as video_router


def register_routes(app: FastAPI) -> None:
    app.include_router(pages_router)
    app.include_router(video_router)
