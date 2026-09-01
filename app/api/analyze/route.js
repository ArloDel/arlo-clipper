import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

function secondsToTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => v < 10 ? '0' + v : v).join(':');
}

export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY || !process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'API Keys missing in .env.local' }, { status: 500 });
    }

    // --- 1. CACHING LAYER ---
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : uuidv4();
    const cacheDir = path.join(process.cwd(), 'public', 'cache');
    
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const cacheFile = path.join(cacheDir, `${videoId}.json`);
    if (fs.existsSync(cacheFile)) {
      console.log(`[Cache] Found cached result for ${videoId}. Skipping AI processing.`);
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return NextResponse.json({ clips: cachedData });
    }
    // ------------------------

    const sessionId = uuidv4();
    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const audioPath = path.join(clipsDir, `${sessionId}-audio.mp3`);

    console.log('[1/4] Downloading Audio for Whisper via yt-dlp...');
    let downloadSuccess = false;
    let dlRetries = 3;
    while (dlRetries > 0 && !downloadSuccess) {
      try {
        const ytdlOptions = {
          output: audioPath,
          format: 'bestaudio[ext=m4a]/bestaudio/best',
          noCheckCertificates: true,
          noWarnings: true,
          noContinue: true,
          extractorArgs: 'youtube:player_client=android', // ALWAYS use android for stable audio
        };

        await youtubedl(url, ytdlOptions);
        downloadSuccess = true;
      } catch (err) {
        dlRetries--;
        console.warn(`[Analyze] Audio download failed, retrying... (${dlRetries} left)`);
        if (dlRetries === 0) throw err;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log('[2/4] Checking audio duration...');
    const getAudioDuration = (filePath) => {
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });
    };

    const duration = await getAudioDuration(audioPath);
    console.log(`Audio duration: ${duration} seconds`);

    const CHUNK_DURATION = 600; // 10 minutes
    const chunks = [];
    
    if (duration > CHUNK_DURATION) {
      console.log(`Duration > 10 mins. Splitting into 10 min MP3 chunks...`);
      let offset = 0;
      let chunkIdx = 1;
      while (offset < duration) {
        const chunkPath = path.join(clipsDir, `${sessionId}-chunk-${chunkIdx}.mp3`);
        await new Promise((resolve, reject) => {
          ffmpeg(audioPath)
            .setStartTime(offset)
            .setDuration(CHUNK_DURATION)
            .format('mp3')
            .output(chunkPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
        chunks.push({ path: chunkPath, offset });
        offset += CHUNK_DURATION;
        chunkIdx++;
      }
    } else {
      chunks.push({ path: audioPath, offset: 0 });
    }

    console.log(`[3/4] Transcribing ${chunks.length} chunk(s) with Groq Whisper...`);
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    let fullTranscript = '';

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Transcribing chunk ${i+1}/${chunks.length} (Offset: ${chunk.offset}s)`);
      
      try {
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(chunk.path),
          model: 'whisper-large-v3',
          response_format: 'verbose_json'
        });

        if (transcription.segments && transcription.segments.length > 0) {
          let blockText = '';
          let blockStart = -1;
          
          transcription.segments.forEach(seg => {
            const segStart = seg.start + chunk.offset;
            if (blockStart === -1) blockStart = segStart;
            
            blockText += seg.text.trim() + ' ';
            
            if (segStart - blockStart >= 15) {
              fullTranscript += `[${secondsToTime(blockStart)}] ${blockText.trim()}\n`;
              blockStart = -1;
              blockText = '';
            }
          });
          
          if (blockText.length > 0) {
             fullTranscript += `[${secondsToTime(blockStart)}] ${blockText.trim()}\n`;
          }
        } else if (transcription.text) {
           const startStr = secondsToTime(chunk.offset);
           fullTranscript += `[${startStr}] ${transcription.text.trim()}\n`;
        }
      } finally {
        console.log(`Cleaning up chunk ${i+1}/${chunks.length}...`);
        if (chunk.path !== audioPath && fs.existsSync(chunk.path)) {
          try { fs.unlinkSync(chunk.path); } catch (e) { console.warn("Cleanup error:", e); }
        }
      }
    }

    console.log(`[4/4] Analyzing text transcript with Gemini 1.5 Flash...`);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
    
    const systemPrompt = `You are an expert video editor. Read the following video transcript containing timestamps. Find the top 3 most engaging, viral-worthy segments (30 to 60 seconds long each). Return ONLY a valid JSON array with EXACTLY 3 objects containing this exact structure:
[
  {
    "title": "A catchy title for the clip",
    "start_time": "00:00:00",
    "end_time": "00:00:45",
    "reason": "Why this clip is engaging"
  }
]
IMPORTANT:
- Every segment MUST have a duration between 30 seconds and 60 seconds (1 minute) (i.e., end_time - start_time >= 30 and <= 60 seconds).
- Ensure the start_time and end_time represent a complete, cohesive, and compelling moment from the transcript.`;

    let highlightData = [];
    let retries = 3;
    
    while (retries > 0) {
      try {
        const result = await model.generateContent([
          { text: systemPrompt },
          { text: fullTranscript }
        ]);

        const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        const parsed = JSON.parse(responseText);
        
        if (Array.isArray(parsed) && parsed.length > 0) {
           highlightData = parsed;
           break;
        } else if (parsed.clips && Array.isArray(parsed.clips)) {
           highlightData = parsed.clips;
           break;
        } else {
           throw new Error("Invalid format returned by LLM");
        }
      } catch (error) {
        let waitTime = 5000;
        if (error.message && error.message.includes('retry in')) {
           const retryMatch = error.message.match(/retry in (\d+\.?\d*)s/);
           if (retryMatch && retryMatch[1]) {
             waitTime = Math.ceil(parseFloat(retryMatch[1])) * 1000 + 2000;
           }
        }
        console.warn(`[Analyze] Gemini LLM parsing error, retrying in ${waitTime/1000}s... (${retries - 1} left) - ${error.message}`);
        await new Promise(r => setTimeout(r, waitTime));
        retries--;
        if (retries === 0) throw error;
      }
    }

    console.log('Analysis complete! Saving to cache...');
    fs.writeFileSync(cacheFile, JSON.stringify(highlightData, null, 2));

    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }

    return NextResponse.json({
      clips: highlightData
    });

  } catch (error) {
    console.error('Analysis Error:', error);
    return NextResponse.json({ error: 'Analysis failed', details: error.message }, { status: 500 });
  }
}
