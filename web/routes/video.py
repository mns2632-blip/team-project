from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse


router = APIRouter()


@router.get("/video_feed")
async def video_feed(request: Request):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    pipeline = request.app.state.pipeline
    return StreamingResponse(
        pipeline.stream.iter_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/metrics")
async def video_metrics(request: Request):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return request.app.state.pipeline.metrics()
