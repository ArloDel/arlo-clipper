import os
import sys
import cv2
import numpy as np
import tempfile
import subprocess
import json

from track_lip import process_lip_tracking, extract_mouth_roi, get_ffmpeg_path

def test_extract_mouth_roi():
    print("Testing mouth ROI extraction...")
    dummy_gray = np.zeros((480, 640), dtype=np.uint8)
    face_box = (100, 100, 150, 150)
    mouth = extract_mouth_roi(dummy_gray, face_box)
    assert mouth is not None, "Mouth ROI should not be None"
    assert mouth.shape == (48, 64), f"Expected shape (48, 64), got {mouth.shape}"
    print("[OK] extract_mouth_roi passed!")

def test_lip_tracking_pipeline():
    print("\nTesting full Lip Tracking pipeline with mock video...")
    temp_dir = tempfile.mkdtemp()
    input_video = os.path.join(temp_dir, "test_input.mp4")
    output_video = os.path.join(temp_dir, "test_output.mp4")

    # Generate a short 2-second 30fps 1280x720 video with two moving circles (simulating faces/talking)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(input_video, fourcc, 30.0, (1280, 720))

    for i in range(60):
        frame = np.full((720, 1280, 3), 30, dtype=np.uint8)
        # Person 1 (left side)
        cv2.circle(frame, (350, 300), 80, (200, 180, 160), -1)
        # Person 1 mouth moving in second 1
        mouth_open = int(10 * np.sin(i * 0.5)) if i < 30 else 0
        cv2.ellipse(frame, (350, 340), (25, 10 + abs(mouth_open)), 0, 0, 360, (50, 50, 180), -1)

        # Person 2 (right side)
        cv2.circle(frame, (930, 300), 80, (180, 170, 160), -1)
        # Person 2 mouth moving in second 2
        mouth_open2 = int(10 * np.sin(i * 0.5)) if i >= 30 else 0
        cv2.ellipse(frame, (930, 340), (25, 10 + abs(mouth_open2)), 0, 0, 360, (50, 50, 180), -1)

        out.write(frame)

    out.release()
    print(f"Generated mock video: {input_video}")

    ffmpeg = get_ffmpeg_path()
    res = process_lip_tracking(
        input_path=input_video,
        output_path=output_video,
        ffmpeg_path=ffmpeg,
        ratio='9:16',
        alpha=0.1
    )

    print("Pipeline result:", json.dumps(res, indent=2))
    assert res['success'] is True, "Lip tracking failed"
    assert os.path.exists(output_video), "Output video was not created"
    assert os.path.getsize(output_video) > 0, "Output video is empty"
    print("[OK] Full Lip Tracking pipeline passed!")

    # Cleanup
    try:
        if os.path.exists(input_video): os.remove(input_video)
        if os.path.exists(output_video): os.remove(output_video)
        os.rmdir(temp_dir)
    except Exception:
        pass

if __name__ == '__main__':
    test_extract_mouth_roi()
    test_lip_tracking_pipeline()
    print("\nALL LIP TRACKER UNIT TESTS PASSED!")
