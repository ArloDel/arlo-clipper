import os
import sys
import argparse
import json
import subprocess
import cv2
import numpy as np

def get_ffmpeg_path():
    # 1. Check local node_modules
    local_ffmpeg = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'
    )
    if os.path.exists(local_ffmpeg):
        return local_ffmpeg
    
    # 2. Check system PATH
    return 'ffmpeg'

def load_cascades():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    frontal_path = os.path.join(script_dir, 'haarcascade_frontalface_default.xml')
    profile_path = os.path.join(script_dir, 'haarcascade_profileface.xml')

    if not os.path.exists(frontal_path) and hasattr(cv2, 'data') and hasattr(cv2.data, 'haarcascades'):
        candidate = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
        if os.path.exists(candidate):
            frontal_path = candidate

    frontal_cascade = None
    if os.path.exists(frontal_path):
        c = cv2.CascadeClassifier(frontal_path)
        if not c.empty():
            frontal_cascade = c

    profile_cascade = None
    if os.path.exists(profile_path):
        c = cv2.CascadeClassifier(profile_path)
        if not c.empty():
            profile_cascade = c

    return frontal_cascade, profile_cascade

def process_face_tracking(input_path, output_path, ffmpeg_path=None, ratio='9:16', alpha=0.08):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    if ffmpeg_path is None:
        ffmpeg_path = get_ffmpeg_path()

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {input_path}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    # Calculate crop dimensions for target ratio
    if ratio in ('9:16', 'mobile'):
        crop_h = height
        crop_w = int(height * 9 / 16)
    else:
        crop_h = height
        crop_w = width

    # Ensure even dimensions
    if crop_w % 2 != 0:
        crop_w -= 1
    if crop_h % 2 != 0:
        crop_h -= 1
    
    if crop_w > width:
        crop_w = width

    frontal_cascade, profile_cascade = load_cascades()

    # Temp video path for OpenCV writing
    temp_dir = os.path.dirname(output_path) or '.'
    os.makedirs(temp_dir, exist_ok=True)
    temp_output = os.path.join(temp_dir, f"temp_tracked_{os.path.basename(output_path)}")

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_output, fourcc, fps, (crop_w, crop_h))

    smooth_center_x = width / 2.0
    last_target_x = width / 2.0
    faces_detected_count = 0

    frame_idx = 0
    step_frames = 3

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        target_center_x = last_target_x

        if frontal_cascade is not None and frame_idx % step_frames == 0:
            scale = 0.5
            small_frame = cv2.resize(frame, (0, 0), fx=scale, fy=scale)
            gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)

            min_size = (int(height * scale * 0.08), int(height * scale * 0.08))
            faces = frontal_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=min_size,
                flags=cv2.CASCADE_SCALE_IMAGE
            )

            if len(faces) == 0 and profile_cascade is not None:
                faces = profile_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=4,
                    minSize=min_size
                )

            if len(faces) > 0:
                faces_detected_count += 1
                best_face = max(faces, key=lambda f: f[2] * f[3])
                fx, fy, fw, fh = best_face
                face_center_x = (fx + fw / 2.0) / scale
                last_target_x = face_center_x
                target_center_x = face_center_x
            else:
                last_target_x = last_target_x * 0.98 + (width / 2.0) * 0.02
                target_center_x = last_target_x

        # Exponential Moving Average for smooth cinematic camera movement
        smooth_center_x = smooth_center_x * (1.0 - alpha) + target_center_x * alpha

        # Calculate crop boundaries
        left = int(smooth_center_x - crop_w / 2.0)
        left = max(0, min(width - crop_w, left))
        if left % 2 != 0:
            left = max(0, left - 1)
        right = left + crop_w

        # Ensure contiguous C-order buffer for Windows Media Foundation VideoWriter
        cropped_frame = np.ascontiguousarray(frame[0:crop_h, left:right])
        out.write(cropped_frame)
        frame_idx += 1

    cap.release()
    out.release()

    # Mux audio from original input using ffmpeg
    try:
        cmd = [
            ffmpeg_path,
            '-y',
            '-i', temp_output,
            '-i', input_path,
            '-map', '0:v:0',
            '-map', '1:a:0?',
            '-c:v', 'libx264',
            '-crf', '18',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-shortest',
            output_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg muxing failed: {result.stderr}")
    finally:
        if os.path.exists(temp_output):
            try:
                os.remove(temp_output)
            except Exception:
                pass

    return {
        "success": True,
        "input": input_path,
        "output": output_path,
        "frames": frame_idx,
        "facesDetectedFrames": faces_detected_count,
        "dimensions": {"width": crop_w, "height": crop_h}
    }

def main():
    parser = argparse.ArgumentParser(description="OpenCV Face Tracking & Auto-Crop")
    parser.add_argument("--input", required=True, help="Input video path")
    parser.add_argument("--output", required=True, help="Output video path")
    parser.add_argument("--ffmpeg", default=None, help="Path to ffmpeg executable")
    parser.add_argument("--ratio", default="9:16", help="Aspect ratio (9:16 or 16:9)")
    parser.add_argument("--alpha", type=float, default=0.08, help="Smoothing alpha (0.01 to 0.5)")

    args = parser.parse_args()

    try:
        res = process_face_tracking(
            input_path=args.input,
            output_path=args.output,
            ffmpeg_path=args.ffmpeg,
            ratio=args.ratio,
            alpha=args.alpha
        )
        print(json.dumps(res))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
