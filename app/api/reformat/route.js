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
    const { clipId, format, startSec, endSec } = await request.json();

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

    const outPath = path.join(clipsDir, `${clipId}-raw-${formatTag(resolvedFormat)}.mp4`);
    const { width, height } = await getVideoDimensions(sourcePath);

    console.log(
      `[Reformat] clip ${clipId} -> ${resolvedFormat} (${width}x${height}, ${start}s-${end}s)...`
    );

    await new Promise((resolve, reject) => {
      configureFormatOutput(ffmpeg(sourcePath), resolvedFormat, width, height)
        .setStartTime(start)
        .setDuration(end - start)
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
