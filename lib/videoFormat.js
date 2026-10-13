import path from 'path';
import fs from 'fs';

/**
 * @fileoverview Output format definitions & ffmpeg command baking helpers.
 * Three user-facing formats share output parity with the legacy 9:16 crop so
 * downstream proportional subtitle styling (ASS) keeps working unchanged:
 * - '9:16': centered vertical crop
 * - '1:1': centered square crop
 * - '9:16-blur': video scaled to fit inside a 9:16 frame, remaining bars filled
 *   with a blurred, zoomed copy of the frame (composition is never cropped)
 * @module lib/videoFormat
 */

export const VIDEO_FORMATS = {
  '9:16': { tag: '9x16' },
  '1:1': { tag: '1x1' },
  '9:16-blur': { tag: '9x16-blur' },
};

/**
 * @param {string} format - User-selected format string
 * @returns {'9:16'|'1:1'|'9:16-blur'|null} Canonical format id or null when unsupported
 */
export function resolveFormat(format) {
  return VIDEO_FORMATS[format] ? format : null;
}

/**
 * @param {string} format - Canonical format id
 * @returns {string} Safe filename tag (no ':' characters)
 */
export function formatTag(format) {
  return VIDEO_FORMATS[format]?.tag || '9x16';
}

/**
 * Configures an ffmpeg command chain to bake the requested output format onto
 * the current input. All branches re-encode video; audio is copied.
 *
 * # ponytail: python trackers (scripts/track_face.py, track_lip.py) only know
 * '9:16'|'1:1'|'16:9'; '9:16-blur' clips cropped to 9:16 center by trackers.
 * Full blur support there needs cv2 pipeline work if ever requested.
 *
 * @param {ffmpeg.Command} command - fluent-ffmpeg command (input already set)
 * @param {'9:16'|'1:1'|'9:16-blur'} format - Canonical format id
 * @param {number} width - Source video width in px
 * @param {number} height - Source video height in px
 * @param {{x:number,y:number,w:number,h:number}|null} [crop=null] - Optional
 *   manual framing crop rect in normalized (0..1) source units; overrides the
 *   format's automatic center positioning when present
 * @returns {ffmpeg.Command} Configured command (caller adds output + listeners)
 */
export function configureFormatOutput(command, format, width, height, crop = null) {
  const encodeOptions = ['-c:v libx264', '-crf 18', '-preset fast', '-c:a copy'];

  if (crop && Array.isArray(crop.keyframes) && crop.keyframes.length > 0) {
    // Animated pan: crop x/y expressions are evaluated per-frame by ffmpeg,
    // so the window can travel between keyframes (zoom stays fixed → see builder).
    const win = resolveAnimatedWindow(crop.keyframes, width, height);
    const exprX = buildAnimatedCropExpression(crop.keyframes, width, height, win, 'x');
    const exprY = buildAnimatedCropExpression(crop.keyframes, width, height, win, 'y');
    return command
      .videoFilters([`crop=${win.w}:${win.h}:${exprX}:${exprY}`])
      .outputOptions(encodeOptions);
  }

  if (crop) {
    // Manual framing: px crop rect (even dims, clamped inside source frame)
    const cw = Math.max(2, Math.round(crop.w * width) - (Math.round(crop.w * width) % 2));
    const ch = Math.max(2, Math.round(crop.h * height) - (Math.round(crop.h * height) % 2));
    const cx = Math.min(width - cw, Math.max(0, Math.round(crop.x * width)));
    const cy = Math.min(height - ch, Math.max(0, Math.round(crop.y * height)));
    return command
      .videoFilters([`crop=${cw}:${ch}:${cx}:${cy}`])
      .outputOptions(encodeOptions);
  }

  if (format === '1:1') {
    const side = Math.min(width, height) - (Math.min(width, height) % 2);
    const cropX = Math.floor((width - side) / 2);
    const cropY = Math.floor((height - side) / 2);
    return command
      .videoFilters([`crop=${side}:${side}:${cropX}:${cropY}`])
      .outputOptions(encodeOptions);
  }

  if (format === '9:16-blur') {
    const frameH = height - (height % 2);
    const frameW = Math.round((frameH * 9) / 16) - (Math.round((frameH * 9) / 16) % 2);
    return command
      .complexFilter(
        `[0:v]split=2[bg][fg];` +
          `[bg]scale=${frameW}:${frameH}:force_original_aspect_ratio=increase,` +
          `crop=${frameW}:${frameH},` +
          `boxblur=luma_radius=40:luma_power=2[bgout];` +
          `[fg]scale=${frameW}:${frameH}:force_original_aspect_ratio=decrease[fgout];` +
          `[bgout][fgout]overlay=(W-w)/2:(H-h)/2`
      )
      .outputOptions(encodeOptions);
  }

  // '9:16' default: centered vertical crop (numeric even dims for libx264)
  const cropW = Math.floor((height * 9) / 16);
  const evenCropW = cropW - (cropW % 2);
  const cropX = Math.floor((width - evenCropW) / 2);
  return command
    .videoFilters([`crop=${evenCropW}:${height}:${cropX}:0`])
    .outputOptions(encodeOptions);
}

/**
 * Resolves the on-disk path of a clip's source (uncropped landscape) slice.
 *
 * @param {string} clipsDir - Absolute clips directory
 * @param {string} clipId - Clip identifier
 * @returns {string|null} Absolute source path or null when missing on disk
 */
export function resolveSourceClipPath(clipsDir, clipId) {
  const sourcePath = path.join(clipsDir, `${clipId}-source.mp4`);
  return fs.existsSync(sourcePath) ? sourcePath : null;
}

/**
 * Computes the fixed (even) crop window in px for animated-pan keyframes.
 * Zoom is static in v1, so every keyframe shares this window size; centers are
 * preserved when keyframes used different box sizes.
 *
 * @param {Array<{t:number,x:number,y:number,w:number,h:number}>} keyframes - Normalized kfs (sorted by t)
 * @param {number} width - Source width px
 * @param {number} height - Source height px
 * @returns {{w:number,h:number}} Window size px (even)
 */
export function resolveAnimatedWindow(keyframes, width, height) {
  const raw = Math.max(2, Math.round(keyframes[0].w * width));
  const rawH = Math.max(2, Math.round(keyframes[0].h * height));
  return { w: Math.max(2, raw - (raw % 2)), h: Math.max(2, rawH - (rawH % 2)) };
}

/**
 * Builds a piecewise-linear ffmpeg expression interpolating between keyframes.
 * Commas are escaped (`\,`) for use inside filter args. crop clamps x/y itself,
 * but endpoints are clamped numerically anyway for safety.
 *
 * # ponytail: linear interpolation only (no easing); add smoothstep terms later
 * if motion feels robotic. Zoom keyframes need zoompan/segment approach — see below.
 *
 * @param {Array<{t:number,x:number,y:number,w:number,h:number}>} keyframes - Sorted by t
 * @param {number} width - Source width px
 * @param {number} height - Source height px
 * @param {{w:number,h:number}} win - Fixed window size px (from resolveAnimatedWindow)
 * @param {'x'|'y'} axis - Which coordinate to interpolate
 * @returns {string} ffmpeg expression for crop=x or crop=y
 */
export function buildAnimatedCropExpression(keyframes, width, height, win, axis) {
  const srcLen = axis === 'x' ? width : height;
  const winLen = axis === 'x' ? win.w : win.h;
  const maxOffset = Math.max(0, srcLen - winLen);

  const points = keyframes.map((kf) => {
    const center = (axis === 'x' ? kf.x : kf.y) * srcLen;
    return { t: Math.max(0, Number(kf.t) || 0), pos: Math.min(maxOffset, Math.max(0, center - winLen / 2)) };
  });

  if (points.length === 1) return String(Math.round(points[0].pos));

  // Sum of ramps: pos0 + Σ (pos_i+1 - pos_i) * clamp((t - t_i)/(t_i+1 - t_i), 0, 1)
  let expr = String(points[0].pos.toFixed(2));
  for (let i = 0; i < points.length - 1; i++) {
    const delta = points[i + 1].pos - points[i].pos;
    if (Math.abs(delta) < 0.01) continue; // stationary anchor
    const span = Math.max(0.05, points[i + 1].t - points[i].t);
    // commas escaped for ffmpeg filter-arg parsing
    expr += `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}*min(1\\,max(0\\,(t-${points[i].t.toFixed(2)})/${span.toFixed(2)}))`;
  }
  return expr;
}
