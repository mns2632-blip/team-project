import time

import cv2
import numpy as np


def generate_frames(detector, socketio):
    cap = cv2.VideoCapture(0)  # 확인된 카메라 장치: /dev/video0

    try:
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            print("[OK] 카메라 연결 완료 (/dev/video0, 640x480)")
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
                    "Connect camera to /dev/video0",
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
    finally:
        cap.release()
