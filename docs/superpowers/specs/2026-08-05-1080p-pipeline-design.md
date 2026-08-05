# 1080p Video Resolution Pipeline Design

**Goal:** Upgrade the video rendering pipeline to output high-quality, crisp 1080p clips instead of the current low-resolution outputs.

## Architecture & Data Flow

1. **Source Download:** 
   - `youtube-dl-exec` is currently fetching the worst possible quality (`worst[ext=mp4]/worst`).
   - We will upgrade this to fetch the best available video quality up to 1080p, paired with the best audio: `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`.

2. **FFMPEG Rendering & Scaling:**
   - When generating the final clip (either mobile or desktop), we will use explicit scaling and formatting filters to guarantee a 1080p output.
   - For **Mobile (9:16)**: Apply `crop=ih*9/16:ih:iw/2-ow/2:0,scale=1080:1920` to crop to vertical and then upscale/downscale exactly to 1080x1920.
   - For **Desktop (16:9)**: Apply `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2` to ensure a 1920x1080 canvas without distortion.

3. **Bitrate Enhancement:**
   - To prevent compression artifacts, we will explicitly set the output video bitrate in FFMPEG (e.g., `-video_bitrate 8000k` or `-b:v 8M`).

## Implementation Constraints
- Target File: `app/api/render/route.js`
- Dependency constraints: `fluent-ffmpeg` and `youtube-dl-exec` usage must remain compatible with current logic.
- Subtitle generation logic must remain untouched; we only augment the video filter parameters.
