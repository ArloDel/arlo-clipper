import os
import sys
import subprocess
import cv2
import numpy as np

def create_synthetic_podcast_video(video_path, width=1280, height=720, fps=30, duration_sec=3):
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(video_path, fourcc, fps, (width, height))
    total_frames = fps * duration_sec

    for i in range(total_frames):
        frame = np.ones((height, width, 3), dtype=np.uint8) * 230
        
        # Speaker 1 (Host on left: around x=28%, y=45%)
        s1_x = int(width * 0.28 + 20 * np.sin(i / 10.0))
        s1_y = int(height * 0.45)
        # Draw Speaker 1 head & torso
        cv2.circle(frame, (s1_x, s1_y), 50, (60, 60, 200), -1)
        cv2.ellipse(frame, (s1_x, s1_y + 90), (70, 50), 0, 0, 180, (40, 40, 160), -1)
        cv2.putText(frame, "HOST", (s1_x - 30, s1_y - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)

        # Speaker 2 (Guest on right: around x=72%, y=45%)
        s2_x = int(width * 0.72 + 20 * np.cos(i / 10.0))
        s2_y = int(height * 0.45)
        # Draw Speaker 2 head & torso
        cv2.circle(frame, (s2_x, s2_y), 50, (200, 100, 60), -1)
        cv2.ellipse(frame, (s2_x, s2_y + 90), (70, 50), 0, 0, 180, (160, 80, 40), -1)
        cv2.putText(frame, "GUEST", (s2_x - 40, s2_y - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)

        # Divider or desk background
        cv2.rectangle(frame, (0, int(height * 0.75)), (width, height), (180, 180, 180), -1)
        cv2.putText(frame, f"Podcast Frame {i+1}/{total_frames}", (40, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (50, 50, 50), 2)

        out.write(frame)

    out.release()
    print(f"Created synthetic podcast video at {video_path}")

def main():
    test_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_out')
    os.makedirs(test_dir, exist_ok=True)
    input_video = os.path.join(test_dir, 'test_podcast_input.mp4')
    output_video = os.path.join(test_dir, 'test_podcast_split_output.mp4')

    create_synthetic_podcast_video(input_video)

    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'track_split_screen.py')
    cmd = [
        sys.executable or 'python',
        script_path,
        '--input', input_video,
        '--output', output_video,
        '--alpha', '0.08'
    ]

    print("Running track_split_screen.py...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print("STDOUT:", res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)

    assert res.returncode == 0, f"Script failed with code {res.returncode}"

    # Verify output video exists and is valid 9:16 aspect ratio
    assert os.path.exists(output_video), f"Output video missing at {output_video}"
    cap = cv2.VideoCapture(output_video)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    print(f"Output dimensions: {w}x{h}")
    # Verify 9:16 aspect ratio
    aspect = w / h
    expected_aspect = 9.0 / 16.0
    assert abs(aspect - expected_aspect) < 0.01, f"Expected 9:16 aspect ratio (~0.5625), got {aspect} ({w}x{h})"

    print("TEST PASSED: Split screen podcast successfully tracked and generated 9:16 vertical video!")

if __name__ == '__main__':
    main()
