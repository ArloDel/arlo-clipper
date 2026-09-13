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

    if not os.path.exists(profile_path) and hasattr(cv2, 'data') and hasattr(cv2.data, 'haarcascades'):
        candidate = os.path.join(cv2.data.haarcascades, 'haarcascade_profileface.xml')
        if os.path.exists(candidate):
            profile_path = candidate

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

def calculate_split_dimensions(width, height):
    """
    Calculate crop dimensions for 2-speaker stacked layout with total 9:16 vertical ratio.
    Each half has 9:8 ratio (crop_w : crop_h = 9 : 8).
    Total stacked video: out_w = crop_w, out_h = 2 * crop_h -> out_w : out_h = 9 : 16.
    Ensures all dimensions are strictly even numbers for x264 YUV420p video encoding.
    """
    # Find integer scaling factor k such that crop_h = 8*k <= height and crop_w = 9*k <= width
    max_k_h = height // 8
    max_k_w = width // 9
    max_k = min(max_k_h, max_k_w)

    # Make k even so crop_w and crop_h are strictly even integers
    k = max(2, max_k & ~1)

    crop_w = 9 * k
    crop_h = 8 * k

    # Safety clamps
    if crop_w > width:
        crop_w = width if width % 2 == 0 else width - 1
    if crop_h > height:
        crop_h = height if height % 2 == 0 else height - 1

    return crop_w, crop_h

def process_podcast_split(input_path, output_path, ffmpeg_path=None, alpha=0.08, draw_divider=True):
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

    crop_w, crop_h = calculate_split_dimensions(width, height)
    out_w = crop_w
    out_h = crop_h * 2

    frontal_cascade, profile_cascade = load_cascades()

    # Temp video path for OpenCV writing
    temp_dir = os.path.dirname(output_path) or '.'
    os.makedirs(temp_dir, exist_ok=True)
    temp_output = os.path.join(temp_dir, f"temp_split_{os.path.basename(output_path)}")

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_output, fourcc, fps, (out_w, out_h))

    # Initial speaker positions (Host / Left = 28%, Guest / Right = 72%)
    default_x1 = width * 0.28
    default_x2 = width * 0.72
    default_y = height * 0.45

    smooth_x1 = default_x1
    smooth_y1 = default_y
    smooth_x2 = default_x2
    smooth_y2 = default_y

    last_target_x1 = default_x1
    last_target_y1 = default_y
    last_target_x2 = default_x2
    last_target_y2 = default_y

    faces_detected_count = 0
    frame_idx = 0
    step_frames = 2

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        target_x1 = last_target_x1
        target_y1 = last_target_y1
        target_x2 = last_target_x2
        target_y2 = last_target_y2

        if (frontal_cascade is not None or profile_cascade is not None) and frame_idx % step_frames == 0:
            scale = 0.5
            small_frame = cv2.resize(frame, (0, 0), fx=scale, fy=scale)
            gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)
            sh, sw = gray.shape

            min_size = (int(height * scale * 0.07), int(height * scale * 0.07))
            detected_raw = []

            # 1. Frontal face detection
            if frontal_cascade is not None:
                faces = frontal_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=4,
                    minSize=min_size,
                    flags=cv2.CASCADE_SCALE_IMAGE
                )
                for (fx, fy, fw, fh) in faces:
                    cx = (fx + fw / 2.0) / scale
                    cy = (fy + fh / 2.0) / scale
                    detected_raw.append((cx, cy, (fw / scale) * (fh / scale)))

            # 2. Profile face detection (both regular and flipped for facing left & right)
            if len(detected_raw) < 2 and profile_cascade is not None:
                # Regular profile (looking one direction)
                prof_faces = profile_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=4,
                    minSize=min_size
                )
                for (fx, fy, fw, fh) in prof_faces:
                    cx = (fx + fw / 2.0) / scale
                    cy = (fy + fh / 2.0) / scale
                    # Deduplicate if overlapping with frontal detection
                    if not any(np.hypot(cx - ocx, cy - ocy) < (np.sqrt(oarea) * 0.6) for (ocx, ocy, oarea) in detected_raw):
                        detected_raw.append((cx, cy, (fw / scale) * (fh / scale)))

                # Flipped profile (looking opposite direction)
                if len(detected_raw) < 2:
                    flipped_gray = cv2.flip(gray, 1)
                    prof_flipped = profile_cascade.detectMultiScale(
                        flipped_gray,
                        scaleFactor=1.1,
                        minNeighbors=4,
                        minSize=min_size
                    )
                    for (fx, fy, fw, fh) in prof_flipped:
                        orig_fx = sw - fx - fw
                        cx = (orig_fx + fw / 2.0) / scale
                        cy = (fy + fh / 2.0) / scale
                        if not any(np.hypot(cx - ocx, cy - ocy) < (np.sqrt(oarea) * 0.6) for (ocx, ocy, oarea) in detected_raw):
                            detected_raw.append((cx, cy, (fw / scale) * (fh / scale)))

            if len(detected_raw) > 0:
                faces_detected_count += len(detected_raw)

                # Spatial clustering into Left candidates and Right candidates
                left_cands = [f for f in detected_raw if f[0] < width * 0.5]
                right_cands = [f for f in detected_raw if f[0] >= width * 0.5]

                # Update Left Speaker (Speaker 1)
                if len(left_cands) > 0:
                    best_left = min(left_cands, key=lambda f: abs(f[0] - last_target_x1))
                    target_x1 = best_left[0]
                    target_y1 = best_left[1]
                else:
                    # Decay slowly toward default host position
                    target_x1 = last_target_x1 * 0.95 + default_x1 * 0.05
                    target_y1 = last_target_y1 * 0.95 + default_y * 0.05

                # Update Right Speaker (Speaker 2)
                if len(right_cands) > 0:
                    best_right = min(right_cands, key=lambda f: abs(f[0] - last_target_x2))
                    target_x2 = best_right[0]
                    target_y2 = best_right[1]
                else:
                    # Decay slowly toward default guest position
                    target_x2 = last_target_x2 * 0.95 + default_x2 * 0.05
                    target_y2 = last_target_y2 * 0.95 + default_y * 0.05
            else:
                # No faces detected: smooth drift toward default podcast anchors
                target_x1 = last_target_x1 * 0.97 + default_x1 * 0.03
                target_y1 = last_target_y1 * 0.97 + default_y * 0.03
                target_x2 = last_target_x2 * 0.97 + default_x2 * 0.03
                target_y2 = last_target_y2 * 0.97 + default_y * 0.03

            last_target_x1 = target_x1
            last_target_y1 = target_y1
            last_target_x2 = target_x2
            last_target_y2 = target_y2

        # Exponential Moving Average for fluid camera tracking
        smooth_x1 = smooth_x1 * (1.0 - alpha) + target_x1 * alpha
        smooth_y1 = smooth_y1 * (1.0 - alpha) + target_y1 * alpha
        smooth_x2 = smooth_x2 * (1.0 - alpha) + target_x2 * alpha
        smooth_y2 = smooth_y2 * (1.0 - alpha) + target_y2 * alpha

        # 1. Top Speaker Crop (Speaker 1 / Left / Host)
        left1 = int(smooth_x1 - crop_w / 2.0)
        left1 = max(0, min(width - crop_w, left1))
        if left1 % 2 != 0:
            left1 = max(0, left1 - 1)

        top1 = int(smooth_y1 - crop_h * 0.45)
        top1 = max(0, min(height - crop_h, top1))
        if top1 % 2 != 0:
            top1 = max(0, top1 - 1)

        crop1 = frame[top1:top1 + crop_h, left1:left1 + crop_w]

        # 2. Bottom Speaker Crop (Speaker 2 / Right / Guest)
        left2 = int(smooth_x2 - crop_w / 2.0)
        left2 = max(0, min(width - crop_w, left2))
        if left2 % 2 != 0:
            left2 = max(0, left2 - 1)

        top2 = int(smooth_y2 - crop_h * 0.45)
        top2 = max(0, min(height - crop_h, top2))
        if top2 % 2 != 0:
            top2 = max(0, top2 - 1)

        crop2 = frame[top2:top2 + crop_h, left2:left2 + crop_w]

        # 3. Vertical Stack (9:16 aspect ratio)
        split_frame = np.vstack([crop1, crop2])

        # 4. Optional sleek dividing line (2px dark border)
        if draw_divider:
            divider_y = crop_h
            split_frame[divider_y - 1 : divider_y + 1, :] = (20, 20, 20)

        out.write(np.ascontiguousarray(split_frame))
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
        "mode": "split_screen_podcast",
        "input": input_path,
        "output": output_path,
        "frames": frame_idx,
        "facesDetectedCount": faces_detected_count,
        "dimensions": {"width": out_w, "height": out_h},
        "ratio": "9:16"
    }

def main():
    parser = argparse.ArgumentParser(description="OpenCV 2-Speaker Podcast Split Screen Auto-Framing (9:16)")
    parser.add_argument("--input", required=True, help="Input video path")
    parser.add_argument("--output", required=True, help="Output video path")
    parser.add_argument("--ffmpeg", default=None, help="Path to ffmpeg executable")
    parser.add_argument("--alpha", type=float, default=0.08, help="Smoothing alpha (0.01 to 0.5)")
    parser.add_argument("--divider", action="store_true", default=True, help="Draw subtle divider line")

    args = parser.parse_args()

    try:
        res = process_podcast_split(
            input_path=args.input,
            output_path=args.output,
            ffmpeg_path=args.ffmpeg,
            alpha=args.alpha,
            draw_divider=args.divider
        )
        print(json.dumps(res))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
