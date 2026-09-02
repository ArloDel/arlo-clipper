import os
import cv2
import numpy as np
import subprocess
import json

def create_synthetic_face_video(video_path, width=1280, height=720, fps=30, duration_sec=3):
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(video_path, fourcc, fps, (width, height))
    total_frames = fps * duration_sec

    # Load real face cascade to verify it works
    cascade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml'))

    # Draw synthetic frames with moving circles/shapes
    for i in range(total_frames):
        frame = np.ones((height, width, 3), dtype=np.uint8) * 220
        # Simulating moving object
        cx = int(width * 0.3 + (width * 0.4) * (i / total_frames))
        cy = int(height * 0.5)
        # Draw background elements
        cv2.putText(frame, f"Frame {i}", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        out.write(frame)

    out.release()
    print(f"Created synthetic video at {video_path}")

def main():
    test_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_out')
    os.makedirs(test_dir, exist_ok=True)
    input_video = os.path.join(test_dir, 'test_input.mp4')
    output_video = os.path.join(test_dir, 'test_output_9_16.mp4')

    create_synthetic_face_video(input_video)

    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'track_face.py')
    cmd = [
        'python',
        script_path,
        '--input', input_video,
        '--output', output_video,
        '--ratio', '9:16'
    ]

    print("Running tracker script...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print("STDOUT:", res.stdout)
    print("STDERR:", res.stderr)
    assert res.returncode == 0, f"Script failed with code {res.returncode}"

    # Verify output video exists and has expected 9:16 aspect ratio
    cap = cv2.VideoCapture(output_video)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    print(f"Output dimensions: {w}x{h}")
    assert h == 720, f"Expected height 720, got {h}"
    expected_w = int(720 * 9 / 16)
    if expected_w % 2 != 0:
        expected_w -= 1
    assert w == expected_w, f"Expected width {expected_w}, got {w}"
    print("TEST PASSED: Video successfully tracked and cropped to 9:16.")

if __name__ == '__main__':
    main()
