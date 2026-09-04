import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import Groq from 'groq-sdk';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function POST(request) {
  try {
    const { url, ratio = '9:16', clips } = await request.json();

    if (!url || !clips || !Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
      return NextResponse.json({ error: 'GROQ_API_KEY is missing in .env.local' }, { status: 500 });
    }

    const sessionId = uuidv4();
    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const videoPath = path.join(clipsDir, `${sessionId}-full.mp4`);

    console.log(`[Prepare Editor] Downloading Full Video...`);
    let downloadSuccess = false;
    let retries = 3;
    let currentClient = 'web';

    while (retries > 0 && !downloadSuccess) {
      try {
        const ytdlOptions = {
          output: videoPath,
          format: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          ffmpegLocation: ffmpegInstaller.path,
          noCheckCertificates: true,
          noWarnings: true,
          noContinue: true,
          jsRuntimes: 'node',
        };

        if (currentClient === 'android') {
          ytdlOptions.extractorArgs = 'youtube:player_client=android';
        }

        await youtubedl(url, ytdlOptions);
        downloadSuccess = true;
      } catch (err) {
        retries--;
        console.warn(`[Prepare Editor] Download failed with ${currentClient}, retrying... (${retries} left)`);
        
        // If default web client fails multiple times, gracefully degrade to android (360p but 100% stable)
        if (retries === 1) {
          console.warn(`[Prepare Editor] Falling back to stable android client for final attempt...`);
          currentClient = 'android';
        }

        if (retries === 0) throw err;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const processedClips = [];
    
    const timeToSeconds = (timeStr) => {
      if (!timeStr) return 0;
      const parts = String(timeStr).split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0] || 0;
    };

    let index = 1;
    for (const clip of clips) {
      console.log(`[Prepare Editor] Processing clip ${index}/${clips.length}...`);
      
      const title = clip.title || clip.text;
      const start_time = clip.start_time || clip.start;
      const end_time = clip.end_time || clip.end;
      const startSec = timeToSeconds(start_time);
      const endSec = timeToSeconds(end_time);
      const durationSec = endSec - startSec;
      
      const clipId = uuidv4();
      const sourceClipPath = path.join(clipsDir, `${clipId}-source.mp4`);
      const rawClipPath = path.join(clipsDir, `${clipId}-raw.mp4`);
      const clipAudioPath = path.join(clipsDir, `${clipId}-clip-audio.mp3`);

      // 1. Slice full 16:9 segment first (needed for OpenCV face detection across full frame)
      console.log(`[Prepare Editor] Slicing source clip ${index}...`);
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .setStartTime(startSec)
          .setDuration(durationSec)
          .outputOptions(['-c:v libx264', '-crf 18', '-preset fast', '-c:a aac'])
          .output(sourceClipPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      // 2. Apply standard ratio crop (center crop for 9:16)
      console.log(`[Prepare Editor] Applying ratio ${ratio} for clip ${index}...`);
      const filters = [];
      if (ratio === '9:16' || ratio === 'mobile') {
        filters.push('crop=ih*9/16:ih:iw/2-ow/2:0');
      }

      await new Promise((resolve, reject) => {
        let command = ffmpeg(sourceClipPath);
        if (filters.length > 0) {
          command = command.videoFilters(filters).outputOptions(['-c:v libx264', '-crf 18', '-preset fast', '-c:a copy']);
        } else {
          command = command.outputOptions(['-c copy']);
        }
        command.output(rawClipPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      // 3. Extract Audio
      console.log(`[Prepare Editor] Extracting Audio for clip ${index}...`);
      await new Promise((resolve, reject) => {
        ffmpeg(rawClipPath)
          .noVideo()
          .format('mp3')
          .output(clipAudioPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      // 4. Transcribe with Groq
      console.log(`[Prepare Editor] Generating transcript for clip ${index}...`);
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(clipAudioPath),
        model: 'whisper-large-v3',
        response_format: 'verbose_json'
      });

      // Extract transcript data
      const segments = transcription.segments.map((seg, i) => ({
        id: i,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim()
      }));

      const videoSrc = `/clips/${path.basename(rawClipPath)}`;
      const sourceSrc = `/clips/${path.basename(sourceClipPath)}`;
      
      processedClips.push({
        id: clipId,
        title: title || `Clip ${index}`,
        hook: clip.hook || title || `Clip ${index}`,
        caption: clip.caption || '',
        channelName: clip.channelName || clip.channel_name || 'YouTube',
        startTime: start_time,
        endTime: end_time,
        startSec,
        endSec,
        hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : ['#Shorts', '#Viral', '#Trending'],
        videoPath: videoSrc,
        sourceVideoPath: sourceSrc,
        centerVideoPath: videoSrc,
        faceTracking: false,
        duration: durationSec,
        segments
      });

      try {
        if (fs.existsSync(clipAudioPath)) fs.unlinkSync(clipAudioPath);
      } catch (e) {
        console.warn("Clip audio cleanup warning:", e);
      }

      index++;
    }

    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch (e) {
      console.warn("Full video cleanup warning:", e);
    }

    return NextResponse.json({
      success: true,
      clips: processedClips
    });

  } catch (error) {
    console.error('Prepare Editor Error:', error);
    return NextResponse.json({ error: 'Failed to prepare clips', details: error.message }, { status: 500 });
  }
}
