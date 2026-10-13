import { NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import { getVideoDimensions } from '@/lib/subtitles';
import { configureFormatOutput, resolveFormat, formatTag } from '@/lib/videoFormat';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * POST /api/reformat
 * Re-slices an existing clip from its untouched landscape source with the
 * requested output format, without re-downloading or re-transcribing.
 * Body: { clipId, format: '9:16'|'1:1'|'9:16-blur', startSec, endSec }
 */
export async function POST(request) {
  try {
    const { clipId, format, startSec, endSec, crop, cropKeyframes } = await request.json();

    if (!clipId || typeof clipId !== 'string' || !/^[a-zA-Z0-9_-]{6,64}$/.test(clipId)) {
      return NextResponse.json({ error: 'Invalid clipId' }, { status: 400 });
    }

    const resolvedFormat = resolveFormat(format);
    if (!resolvedFormat) {
      return NextResponse.json(
        { error: `Unsupported format. Supported: 9:16, 1:1, 9:16-blur` },
        { status: 400 }
      );
    }

    const start = Number(startSec);
    const end = Number(endSec);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 900) {
      return NextResponse.json({ error: 'Invalid time range' }, { status: 400 });
    }

    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    const sourcePath = path.join(clipsDir, `${clipId}-source.mp4`);
    if (!fs.existsSync(sourcePath)) {
      return NextResponse.json(
        { error: 'Source clip not found for this session_id; cannot reformat' },
        { status: 404 }
      );
    }

    const outBase = path.join(clipsDir, `${clipId}-raw-${formatTag(resolvedFormat)}`);

    const { width, height } = await getVideoDimensions(sourcePath);

    // Optional manual framing: either animated-pan keyframes or a single static rect
    let cropRect = null;
    if (Array.isArray(cropKeyframes) && cropKeyframes.length > 0) {
      const valid =
        cropKeyframes.length <= 12 &&
        cropKeyframes.every((kf) =>
          kf && Number.isFinite(kf.t) && kf.t >= 0 && kf.t <= 3600 &&
          Number.isFinite(kf.x) && Number.isFinite(kf.y) &&
          Number.isFinite(kf.w) && Number.isFinite(kf.h) &&
          kf.x >= -0.02 && kf.y >= -0.02 && kf.w >= 0.05 && kf.h >= 0.05 && kf.w <= 1 && kf.h <= 1 &&
          kf.x + kf.w <= 1.02 && kf.y + kf.h <= 1.02
        );
      if (!valid) {
        return NextResponse.json({ error: 'Invalid crop keyframes' }, { status: 400 });
      }

      // Aspect-lock every keyframe (3% tolerance) + time-sort
      const targetAspect = resolvedFormat === '1:1' ? 1 : 9 / 16;
      for (const kf of cropKeyframes) {
        const kfAspect = (kf.w * width) / (kf.h * height);
        if (Math.abs(kfAspect - targetAspect) / targetAspect > 0.03) {
          return NextResponse.json(
            { error: 'Crop keyframe aspect does not match the selected format' },
            { status: 400 }
          );
        }
      }
      cropKeyframes.sort((a, b) => a.t - b.t);
      cropRect = { keyframes: cropKeyframes.map((kf) => ({ t: kf.t, x: kf.x, y: kf.y, w: kf.w, h: kf.h })) };
    } else if (crop) {
      const { x, y, w, h } = crop;
      const validShape =
        [x, y, w, h].every((v) => Number.isFinite(v)) &&
        w >= 0.05 && h >= 0.05 && w <= 1 && h <= 1 &&
        x >= -0.02 && y >= -0.02 && x + w <= 1.02 && y + h <= 1.02;
      if (!validShape) {
        return NextResponse.json({ error: 'Invalid crop rect' }, { status: 400 });
      }

      // Aspect-lock: crop box must match the format's aspect (3% tolerance)
      const targetAspect = resolvedFormat === '1:1' ? 1 : 9 / 16;
      const cropAspect = (w * width) / (h * height);
      if (Math.abs(cropAspect - targetAspect) / targetAspect > 0.03) {
        return NextResponse.json(
          { error: 'Crop box aspect does not match the selected format' },
          { status: 400 }
        );
      }
      cropRect = { x, y, w, h };
    }

    const outSuffix = cropRect && cropRect.keyframes ? '-pan' : cropRect ? '-crop' : '';
    const outPath = `${outBase}${outSuffix}.mp4`;

    console.log(
      `[Reformat] clip ${clipId} -> ${resolvedFormat}${cropRect ? (cropRect.keyframes ? ` (animated pan, ${cropRect.keyframes.length} kf)` : ' (manual crop)') : ''} (${width}x${height})...`
    );

    // Source slice already contains ONLY the clip (prepare-editor sliced it),
    // so bake the entire file — startSec/endSec are full-video offsets and must
    // NOT be re-applied as seeks (seeking past EOF yields audio-only stubs).
    await new Promise((resolve, reject) => {
      configureFormatOutput(ffmpeg(sourcePath), resolvedFormat, width, height, cropRect)
        .output(outPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    return NextResponse.json({
      success: true,
      format: resolvedFormat,
      videoPath: `/clips/${path.basename(outPath)}`,
    });
  } catch (error) {
    console.error('[API /api/reformat] Error:', error);
    return NextResponse.json({ error: 'Reformat failed', details: error.message }, { status: 500 });
  }
}
