import { NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';
import { saveClip } from '../../../lib/db';
import { getVideoDimensions, generateAssSubtitleFile } from '../../../lib/subtitles';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export async function POST(request) {
  try {
    const { clips } = await request.json();

    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const savedClips = [];

    let index = 1;
    for (const clip of clips) {
      console.log(`[Render Final] Processing clip ${index}/${clips.length}...`);

      const rawClipPath = path.join(process.cwd(), 'public', clip.videoPath.replace(/^\//, ''));
      const assPath = path.join(clipsDir, `${clip.id}-subtitle.ass`);
      const finalSubtitledPath = path.join(clipsDir, `${clip.id}-final.mp4`);

      // 1. Get exact video dimensions for 1:1 proportional styling
      const { width, height } = await getVideoDimensions(rawClipPath);
      console.log(`[Render Final] Clip ${index} dimensions: ${width}x${height}`);

      // 2. Generate ASS subtitle script with animated tags & proportional scale
      generateAssSubtitleFile({
        assPath,
        segments: clip.segments || [],
        style: clip.style || {},
        videoWidth: width,
        videoHeight: height,
      });

      // 3. Burn Subtitles with libass using FFmpeg
      const relativeAssPath = `public/clips/${clip.id}-subtitle.ass`.replace(/\\/g, '/');
      console.log(`[Render Final] Burning Animated Subtitles for clip ${index}...`);

      await new Promise((resolve, reject) => {
        ffmpeg(rawClipPath)
          .videoFilters([`subtitles=${relativeAssPath}`])
          .outputOptions(['-c:v libx264', '-crf 18', '-preset fast', '-c:a aac'])
          .output(finalSubtitledPath)
          .on('end', resolve)
          .on('error', (err) => {
            console.error(`[Render Final] FFmpeg error on clip ${index}:`, err);
            reject(err);
          })
          .run();
      });

      const videoSrc = `/clips/${path.basename(finalSubtitledPath)}`;

      const savedClip = saveClip({
        title: clip.title || `Clip ${index}`,
        videoPath: videoSrc,
        duration: clip.duration,
        hook: clip.hook || clip.title || `Clip ${index}`,
        caption: clip.caption || '',
        channelName: clip.channelName || 'YouTube',
        startTime: clip.startTime || clip.start_time || '',
        endTime: clip.endTime || clip.end_time || '',
        hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : [],
      });

      savedClips.push(savedClip);

      // 4. Cleanup raw intermediate video and ass file
      try {
        if (fs.existsSync(rawClipPath)) fs.unlinkSync(rawClipPath);
        if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
        const sourcePath = path.join(clipsDir, `${clip.id}-source.mp4`);
        if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
        const trackedPath = path.join(clipsDir, `${clip.id}-tracked.mp4`);
        if (fs.existsSync(trackedPath) && trackedPath !== rawClipPath) fs.unlinkSync(trackedPath);
      } catch (e) {
        console.warn('Final cleanup warning:', e);
      }

      index++;
    }

    return NextResponse.json({
      success: true,
      clips: savedClips,
    });
  } catch (error) {
    console.error('Render Final Error:', error);
    return NextResponse.json({ error: 'Final render failed', details: error.message }, { status: 500 });
  }
}
