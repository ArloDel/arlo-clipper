import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import Groq from 'groq-sdk';
import { saveClip } from '../../../lib/db';

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function POST(request) {
  try {
    const { url, ratio, subtitles = true, font = 'Impact', size = '24', color = '#FFFF00', folderId } = await request.json();

    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing in .env.local' }, { status: 500 });
    }

    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
      return NextResponse.json({ error: 'GROQ_API_KEY is missing in .env.local' }, { status: 500 });
    }

    const sessionId = uuidv4();
    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const audioPath = path.join(clipsDir, `${sessionId}-audio.m4a`);
    const videoPath = path.join(clipsDir, `${sessionId}-full.mp4`);
    const finalClipPath = path.join(clipsDir, `${sessionId}-highlight.mp4`);
    const clipAudioPath = path.join(clipsDir, `${sessionId}-clip-audio.mp3`);
    const srtPath = path.join(clipsDir, `${sessionId}-subtitle.srt`);
    const finalSubtitledPath = path.join(clipsDir, `${sessionId}-highlight-subbed.mp4`);

    console.log('[1/6] Downloading Audio for Gemini...');
    await youtubedl(url, {
      output: audioPath,
      format: 'bestaudio[ext=m4a]',
      noCheckCertificates: true,
      noWarnings: true,
    });

    console.log('[2/6] Uploading and Analyzing Audio with Gemini 1.5 Flash...');
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const uploadResult = await fileManager.uploadFile(audioPath, {
      mimeType: 'audio/mp4',
      displayName: `Audio-${sessionId}`,
    });

    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const systemPrompt = `You are an expert video editor. Listen to the audio and find the single most engaging, viral-worthy segment (15 to 45 seconds long). Return ONLY a valid JSON object with this exact structure:
{
  "title": "A catchy title for the clip",
  "start_time": 0,
  "end_time": 30,
  "score": "98%"
}`;

    const result = await model.generateContent([
      { fileData: { mimeType: uploadResult.file.mimeType, fileUri: uploadResult.file.uri } },
      { text: systemPrompt }
    ]);

    const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
    let highlightData;
    try {
      highlightData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON:", responseText);
      throw new Error("Gemini returned invalid JSON");
    }

    const startSec = highlightData.start_time;
    const durationSec = highlightData.end_time - highlightData.start_time;

    console.log(`[3/6] Downloading Full Video... (Highlight found at ${startSec}s, duration: ${durationSec}s)`);
    await youtubedl(url, {
      output: videoPath,
      format: 'worst[ext=mp4]/worst', 
      noCheckCertificates: true,
      noWarnings: true,
    });

    console.log('[4/6] Slicing Video with FFMPEG...');
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(startSec)
        .setDuration(durationSec)
        .output(finalClipPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    if (subtitles) {
      console.log('[5/6] Extracting Audio & Generating Subtitles via Groq Whisper...');
      // Extract audio from the short clip for Whisper
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
      
      // Convert verbose_json to SRT format
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

      // Save SRT
      fs.writeFileSync(srtPath, srtContent);
    } else {
      console.log('[5/6] Subtitles disabled. Skipping extraction and transcription...');
    }

    console.log('[6/6] Burning Subtitles and Applying Ratio...');
    // Use relative path for subtitles filter to avoid Windows absolute path issues in ffmpeg
    const relativeSrtPath = `public/clips/${sessionId}-subtitle.srt`;
    const filters = [];
    if (ratio === 'mobile') {
      // Center crop for 9:16 vertical video
      filters.push('crop=ih*9/16:ih:iw/2-ow/2:0');
    }

    if (subtitles) {
      // Convert hex color #RRGGBB to ASS color &HBBGGRR&
      let assColor = '&H00FFFF&'; // Default Yellow
      if (color && color.startsWith('#') && color.length === 7) {
        const r = color.substring(1, 3);
        const g = color.substring(3, 5);
        const b = color.substring(5, 7);
        assColor = `&H${b}${g}${r}&`;
      }

      const forceStyle = `FontName=${font},FontSize=${size},PrimaryColour=${assColor}`;
      filters.push(`subtitles=${relativeSrtPath}:force_style='${forceStyle}'`);
    }

    await new Promise((resolve, reject) => {
      ffmpeg(finalClipPath)
        .videoFilters(filters)
        .output(finalSubtitledPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    console.log('Processing complete! Cleaning up temporary files...');
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (fs.existsSync(finalClipPath)) fs.unlinkSync(finalClipPath);
      if (fs.existsSync(clipAudioPath)) fs.unlinkSync(clipAudioPath);
      if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
      await fileManager.deleteFile(uploadResult.file.name);
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }

    const videoSrc = `/clips/${sessionId}-highlight-subbed.mp4`;
    const savedClip = saveClip({
      folderId: folderId || null,
      title: highlightData.title,
      videoPath: videoSrc,
      duration: durationSec
    });

    return NextResponse.json({
      success: true,
      clips: [
        {
          id: savedClip.id,
          title: highlightData.title,
          duration: `0:${durationSec}`,
          score: highlightData.score,
          src: videoSrc
        }
      ]
    });

  } catch (error) {
    console.error('Processing Error:', error);
    return NextResponse.json({ error: 'Processing failed', details: error.message }, { status: 500 });
  }
}
