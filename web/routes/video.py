from flask import Blueprint, Response, current_app

from web.services.camera import generate_frames


video = Blueprint("video", __name__)


@video.get("/video_feed")
def video_feed():
    return Response(
        generate_frames(
            current_app.extensions["fall_detector"],
            current_app.extensions["socketio"],
        ),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )
