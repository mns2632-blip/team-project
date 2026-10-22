from flask import Blueprint, Response, abort, current_app, session

from web.services.camera import generate_frames


video = Blueprint("video", __name__)


@video.get("/video_feed")
def video_feed():
    if not session.get("authenticated"):
        abort(401)

    return Response(
        generate_frames(
            current_app.extensions["fall_detector"],
            current_app.extensions["socketio"],
        ),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )
