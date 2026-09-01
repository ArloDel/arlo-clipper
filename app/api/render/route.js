import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import Groq from 'groq-sdk';
import { saveClip } from '../../../lib/db';
import { generateAssSubtitleFile } from '../../../lib/subtitles';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export async function POST(request) {
  try {
    let { url, ratio, subtitles = true, font = 'Impact', size = 'Medium', color = '#FFFF00', clips } = await request.json();
    subtitles = subtitles === true || subtitles === 'true';

    if (!url || !clips || !Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    if (subtitles && (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here')) {
      return NextResponse.json({ error: 'GROQ_API_KEY is missing in .env.local' }, { status: 500 });
    }

    const sessionId = uuidv4();
    const clipsDir = path.join(process.cwd(), 'public', 'clips');

    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const videoPath = path.join(clipsDir, `${sessionId}-full.mp4`);

    console.log(`[Render] Downloading Full Video...`);
    await youtubedl(url, {
      output: videoPath,
      format: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      ffmpegLocation: ffmpegInstaller.path,
      noCheckCertificates: true,
      noWarnings: true,
    });

    const savedClips = [];

    const timeToSeconds = (timeStr) => {
      if (!timeStr) return 0;
      const parts = String(timeStr).split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0] || 0;
    };

    let index = 1;
    for (const clip of clips) {
      console.log(`[Render] Processing clip ${index}/${clips.length}...`);

      const title = clip.title || clip.text;
      const start_time = clip.start_time || clip.start;
      const end_time = clip.end_time || clip.end;
      const startSec = timeToSeconds(start_time);
      const endSec = timeToSeconds(end_time);
      const durationSec = endSec - startSec;

      const clipId = uuidv4();
      const finalClipPath = path.join(clipsDir, `${clipId}-highlight.mp4`);
      const clipAudioPath = path.join(clipsDir, `${clipId}-clip-audio.mp3`);
      const assPath = path.join(clipsDir, `${clipId}-subtitle.ass`);
      const finalSubtitledPath = path.join(clipsDir, `${clipId}-final.mp4`);

      console.log(`[Render] Slicing Video with FFMPEG (Start: ${start_time}, End: ${end_time})...`);
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .setStartTime(startSec)
          .setDuration(durationSec)
          .output(finalClipPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      let finalOutput = finalClipPath;

      const isMobile = ratio === '9:16' || ratio === 'mobile';
      const targetWidth = isMobile ? 1080 : 1920;
      const targetHeight = isMobile ? 1920 : 1080;

      if (subtitles) {
        console.log(`[Render] Extracting Audio & Generating Subtitles for clip ${index}...`);
        await new Promise((resolve, reject) => {
          ffmpeg(finalClipPath)
            .noVideo()
            .format('mp3')
            .output(clipAudioPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(clipAudioPath),
          model: 'whisper-large-v3',
          response_format: 'verbose_json',
        });

        const segments = transcription.segments.map((seg, i) => ({
          id: i,
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        }));

        generateAssSubtitleFile({
          assPath,
          segments,
          style: {
            font,
            size,
            color,
            outline: true,
            shadow: true,
            animation: 'Pop',
          },
          videoWidth: targetWidth,
          videoHeight: targetHeight,
        });

        console.log(`[Render] Burning Subtitles and Applying Ratio for clip ${index}...`);
        const relativeAssPath = `public/clips/${clipId}-subtitle.ass`.replace(/\\/g, '/');
        const filters = [];
        if (isMobile) {
          filters.push('crop=ih*9/16:ih:iw/2-ow/2:0,scale=1080:1920');
        } else {
          filters.push('scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
        }
        filters.push(`subtitles=${relativeAssPath}`);

        await new Promise((resolve, reject) => {
          ffmpeg(finalClipPath)
            .videoFilters(filters)
            .outputOptions(['-c:v libx264', '-crf 18', '-preset fast', '-c:a aac'])
            .output(finalSubtitledPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        finalOutput = finalSubtitledPath;
      } else {
        console.log(`[Render] Applying Ratio for clip ${index}...`);
        const filters = [];
        if (isMobile) {
          filters.push('crop=ih*9/16:ih:iw/2-ow/2:0,scale=1080:1920');
        } else {
          filters.push('scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
        }
        await new Promise((resolve, reject) => {
          ffmpeg(finalClipPath)
            .videoFilters(filters)
            .outputOptions(['-c:v libx264', '-crf 18', '-preset fast', '-c:a aac'])
            .output(finalSubtitledPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
        finalOutput = finalSubtitledPath;
      }

      const videoSrc = `/clips/${path.basename(finalOutput)}`;

      const savedClip = saveClip({
        title: title || `Clip ${index}`,
        videoPath: videoSrc,
        duration: durationSec,
      });

      savedClips.push(savedClip);

      try {
        if (finalOutput !== finalClipPath && fs.existsSync(finalClipPath)) fs.unlinkSync(finalClipPath);
        if (fs.existsSync(clipAudioPath)) fs.unlinkSync(clipAudioPath);
        if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
      } catch (e) {
        console.warn('Clip cleanup warning:', e);
      }

      index++;
    }

    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch (e) {
      console.warn('Full video cleanup warning:', e);
    }

    return NextResponse.json({
      success: true,
      clips: savedClips,
    });
  } catch (error) {
    console.error('Render Error:', error);
    return NextResponse.json({ error: 'Render failed', details: error.message }, { status: 500 });
  }
}
