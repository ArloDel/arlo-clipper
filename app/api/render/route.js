import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import Groq from 'groq-sdk';
import { saveClip } from '../../../lib/db';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function POST(request) {
  try {
    const { url, ratio, subtitles = true, font = 'Impact', size = '24', color = '#FFFF00', clips } = await request.json();

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
      format: 'worst[ext=mp4]/worst', 
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
      const srtPath = path.join(clipsDir, `${clipId}-subtitle.srt`);
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
          response_format: 'verbose_json'
        });
        
        const formatTime = (secs) => {
          const d = new Date(secs * 1000);
          const h = String(Math.floor(secs / 3600)).padStart(2, '0');
          const m = String(d.getUTCMinutes()).padStart(2, '0');
          const s = String(d.getUTCSeconds()).padStart(2, '0');
          const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
          return `${h}:${m}:${s},${ms}`;
        };
        
        const srtContent = transcription.segments.map((seg, i) => {
          return `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}\n`;
        }).join('\n');

        fs.writeFileSync(srtPath, srtContent);
        
        console.log(`[Render] Burning Subtitles and Applying Ratio for clip ${index}...`);
        const relativeSrtPath = `public/clips/${clipId}-subtitle.srt`;
        const filters = [];
        if (ratio === 'mobile') {
          filters.push('crop=ih*9/16:ih:iw/2-ow/2:0');
        }

        let assColor = '&H00FFFF&';
        if (color && color.startsWith('#') && color.length === 7) {
          const r = color.substring(1, 3);
          const g = color.substring(3, 5);
          const b = color.substring(5, 7);
          assColor = `&H${b}${g}${r}&`;
        }

        const forceStyle = `FontName=${font},FontSize=${size},PrimaryColour=${assColor}`;
        filters.push(`subtitles=${relativeSrtPath}:force_style='${forceStyle}'`);

        await new Promise((resolve, reject) => {
          ffmpeg(finalClipPath)
            .videoFilters(filters)
            .output(finalSubtitledPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
        
        finalOutput = finalSubtitledPath;
      } else if (ratio === 'mobile') {
        console.log(`[Render] Applying Ratio for clip ${index}...`);
        await new Promise((resolve, reject) => {
          ffmpeg(finalClipPath)
            .videoFilters(['crop=ih*9/16:ih:iw/2-ow/2:0'])
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
        duration: durationSec
      });
      
      savedClips.push(savedClip);

      try {
        if (finalOutput !== finalClipPath && fs.existsSync(finalClipPath)) fs.unlinkSync(finalClipPath);
        if (fs.existsSync(clipAudioPath)) fs.unlinkSync(clipAudioPath);
        if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
      } catch (e) {
        console.warn("Clip cleanup warning:", e);
      }

      index++;
    }

    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch (e) {
      console.warn("Full video cleanup warning:", e);
    }

    return NextResponse.json({
      success: true
    });

  } catch (error) {
    console.error('Render Error:', error);
    return NextResponse.json({ error: 'Render failed', details: error.message }, { status: 500 });
  }
}
