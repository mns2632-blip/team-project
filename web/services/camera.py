import time

import cv2
import numpy as np


def generate_frames(detector, socketio):
    cap = cv2.VideoCapture(1)  # 0=내장카메라, 1=C920

    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        print("[OK] Logitech C920 연결 완료 (1280x720 @ 30fps)")
    else:
        while True:
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
                "Connect Logitech C920",
                (120, 260),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (60, 60, 60),
                1,
            )
            _, buf = cv2.imencode(".jpg", frame)
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
            time.sleep(0.033)
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame, status = detector.detect(frame)
        socketio.emit("detection_update", {"status": status})

        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
