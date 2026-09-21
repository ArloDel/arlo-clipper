import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

import { saveClip } from './db.js';
import { getVideoDimensions, generateAssSubtitleFile } from './subtitles.js';
import { buildRenderComplexFilter } from './audioDucking.js';
import { detectAutoBroll, ensureBrollAssets } from './broll.js';
import { ensureAudioAssets } from './audioAssets.js';
import { dispatchWebhookEvent, addWebhookLog } from './webhooks.js';
import { publishToMultiplePlatforms } from './socialPublishers.js';
import { calculateViralityScore } from './viralityScore.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') return timeStr;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function secondsToTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => (v < 10 ? '0' + v : v)).join(':');
}

/**
 * Execute OpenCV Face Tracking script on a video file
 */
async function runFaceTrackingScript({ inputPath, outputPath, ratio = '9:16' }) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'track_face.py');
  const ffmpegPath = ffmpegInstaller.path;

  const args = [
    scriptPath,
    '--input', inputPath,
    '--output', outputPath,
    '--ffmpeg', ffmpegPath,
    '--ratio', ratio,
    '--alpha', '0.08',
  ];

  return new Promise((resolve, reject) => {
    const pyProcess = spawn('python', args, { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (d) => { stdout += d.toString(); });
    pyProcess.stderr.on('data', (d) => { stderr += d.toString(); });

    pyProcess.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout.trim())); }
        catch { resolve({ success: true, stdout }); }
      } else {
        console.warn(`[Webhook Pipeline] OpenCV face tracking warning (code ${code}):`, stderr || stdout);
        // Fallback gracefully: if Python OpenCV fails, resolve false so fallback crop is used
        resolve({ success: false, error: stderr || stdout });
      }
    });

    pyProcess.on('error', (err) => {
      console.warn('[Webhook Pipeline] Face tracking spawn error:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Execute OpenCV Podcast Split Screen script on a video file
 */
async function runSplitScreenScript({ inputPath, outputPath }) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'track_split_screen.py');
  const ffmpegPath = ffmpegInstaller.path;

  const args = [
    scriptPath,
    '--input', inputPath,
    '--output', outputPath,
    '--ffmpeg', ffmpegPath,
    '--alpha', '0.08',
    '--divider',
  ];

  return new Promise((resolve, reject) => {
    const pyProcess = spawn('python', args, { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (d) => { stdout += d.toString(); });
    pyProcess.stderr.on('data', (d) => { stderr += d.toString(); });

    pyProcess.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout.trim())); }
        catch { resolve({ success: true, stdout }); }
      } else {
        console.warn(`[Webhook Pipeline] OpenCV split screen warning (code ${code}):`, stderr || stdout);
        resolve({ success: false, error: stderr || stdout });
      }
    });

    pyProcess.on('error', (err) => {
      console.warn('[Webhook Pipeline] Split screen spawn error:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Full Automated Webhook Processing Pipeline
 * Orchestrates: Download -> Whisper transcription -> Gemini hook/caption -> Auto B-Roll/SFX/BGM -> Render -> DB -> Callback
 */
export async function processWebhookVideoJob(options = {}) {
  const {
    jobId = crypto.randomUUID(),
    url,
    localInputPath, // For local test files / direct simulation
    ratio = '9:16',
    faceTracking = false,
    splitScreen = false,
    subtitles = true,
    subtitleAnimation = 'Pop',
    font = 'Impact',
    fontSize = 'Medium',
    size = 'Medium',
    color = '#FFFF00',
    broll = true,
    bgm = 'upbeat-energetic',
    ducking = 'medium',
    sfx = true,
    callbackUrl,
    secret,
    customClips = null,
    maxClips = 3,
    autoPublish = null, // { enabled: boolean, platforms: string[], privacy: string }
  } = options;

  const parseBool = (v, defaultVal = false) =>
    v === true || v === 'true' ? true : v === false || v === 'false' ? false : defaultVal;

  const isFaceTracking = parseBool(faceTracking, false);
  const isSplitScreen = parseBool(splitScreen, false);
  const isSubtitles = parseBool(subtitles, true);
  const isSfx = parseBool(sfx, true);
  const isBrollEnabled = broll !== false && broll !== 'false' && broll !== 'none';
  const brollTheme = typeof broll === 'string' && broll !== 'none' && broll !== 'false' ? broll : 'auto';
  const resolvedFontSize = fontSize || size || 'Medium';

  const startTime = Date.now();
  const clipsDir = path.join(process.cwd(), 'public', 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  // Ensure assets are initialized
  ensureAudioAssets();
  ensureBrollAssets();

  console.log(`[Webhook Pipeline] Starting Job ${jobId} for url: ${url || localInputPath}...`);

  addWebhookLog({
    id: jobId,
    type: 'inbound',
    event: 'pipeline.started',
    status: 'processing',
    url: url || localInputPath,
    callbackUrl: callbackUrl || '',
    details: {
      ratio,
      faceTracking,
      splitScreen,
      subtitles,
      subtitleAnimation,
      broll: isBrollEnabled,
      bgm,
      ducking,
    },
  });

  const fullVideoPath = path.join(clipsDir, `${jobId}-full.mp4`);
  const fullAudioPath = path.join(clipsDir, `${jobId}-audio.mp3`);

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Obtain Video & Audio (Download or copy local input)
    // ─────────────────────────────────────────────────────────────────────────
    let channelName = 'YouTube';
    let videoTitle = 'Automated Video Clip';

    if (localInputPath && fs.existsSync(localInputPath)) {
      console.log(`[Webhook Pipeline] Using provided local video file: ${localInputPath}`);
      fs.copyFileSync(localInputPath, fullVideoPath);
      // Extract low bitrate mono audio
      console.log('[Webhook Pipeline] Extracting audio for transcription...');
      await new Promise((resolve, reject) => {
        ffmpeg(fullVideoPath)
          .noVideo()
          .audioChannels(1)
          .audioBitrate('32k')
          .format('mp3')
          .output(fullAudioPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    } else if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      // Step 1A: Extract Metadata & Download Fast Lightweight Audio First
      console.log(`[Webhook Pipeline] [1/5] Fetching video metadata & fast audio stream from ${url}...`);
      try {
        const meta = await youtubedl(url, {
          dumpSingleJson: true,
          noWarnings: true,
          noCheckCertificates: true,
          preferFreeFormats: true,
        });
        if (meta) {
          channelName = meta.uploader || meta.channel || meta.uploader_id || 'YouTube';
          videoTitle = meta.title || 'Automated Video Clip';
        }
      } catch (metaErr) {
        console.warn('[Webhook Pipeline] Metadata extraction warning:', metaErr.message);
      }

      // Download lightweight audio for instant Whisper analysis
      console.log('[Webhook Pipeline] [2/5] Downloading fast audio for Whisper transcription...');
      let audioDownloadSuccess = false;
      let dlRetries = 3;
      while (dlRetries > 0 && !audioDownloadSuccess) {
        try {
          await youtubedl(url, {
            output: fullAudioPath,
            format: 'bestaudio[ext=m4a]/bestaudio/best',
            noCheckCertificates: true,
            noWarnings: true,
            noContinue: true,
            extractorArgs: 'youtube:player_client=android',
          });
          audioDownloadSuccess = true;
        } catch (audErr) {
          dlRetries--;
          console.warn(`[Webhook Pipeline] Audio download retry ${dlRetries}:`, audErr.message);
          if (dlRetries === 0) throw audErr;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } else {
      throw new Error('No valid URL or localInputPath provided');
    }

    const getDuration = (filePath) =>
      new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration || 30);
        });
      });

    const totalDuration = await getDuration(fullAudioPath);
    console.log(`[Webhook Pipeline] Audio duration: ${totalDuration.toFixed(1)}s (${(totalDuration / 60).toFixed(1)} mins)`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Transcribe & Segment Extraction
    // ─────────────────────────────────────────────────────────────────────────
    console.log('[Webhook Pipeline] [3/5] Transcribing speech & analyzing segments...');
    let highlightSegments = [];

    // If custom segments were passed in options, prioritize them
    if (Array.isArray(customClips) && customClips.length > 0) {
      console.log(`[Webhook Pipeline] Using ${customClips.length} custom clip segments from payload.`);
      highlightSegments = customClips.map((c, idx) => ({
        title: c.title || `Clip ${idx + 1}`,
        hook: c.hook || c.title || `Viral Hook ${idx + 1}`,
        caption: c.caption || '',
        channelName: c.channelName || channelName,
        startTime: c.startTime || c.start || '00:00:00',
        endTime: c.endTime || c.end || secondsToTime(Math.min(30, totalDuration)),
        hashtags: Array.isArray(c.hashtags) ? c.hashtags : ['#Shorts', '#Viral', '#Trending'],
      }));
    } else {
      // Automatic Transcription & AI extraction
      let transcriptionText = '';

      // Chunk audio if total duration > 10 mins (600s) to keep below Groq 25MB limit
      const CHUNK_DURATION = 600;
      const chunks = [];

      if (totalDuration > CHUNK_DURATION) {
        console.log(`[Webhook Pipeline] Video duration > 10 mins. Splitting audio into 10 min chunks...`);
        let offset = 0;
        let chunkIdx = 1;
        while (offset < totalDuration) {
          const chunkPath = path.join(clipsDir, `${jobId}-chunk-${chunkIdx}.mp3`);
          await new Promise((resolve, reject) => {
            ffmpeg(fullAudioPath)
              .inputOptions(['-ss', String(offset)])
              .duration(CHUNK_DURATION)
              .audioChannels(1)
              .audioBitrate('32k')
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
        chunks.push({ path: fullAudioPath, offset: 0 });
      }

      // Transcribe with Groq Whisper
      if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          try {
            console.log(`[Webhook Pipeline] Transcribing chunk ${i + 1}/${chunks.length} (Offset: ${chunk.offset}s)...`);
            const transcription = await groq.audio.transcriptions.create({
              file: fs.createReadStream(chunk.path),
              model: 'whisper-large-v3',
              response_format: 'verbose_json',
            });
            if (transcription.text) {
              const startStr = secondsToTime(chunk.offset);
              transcriptionText += `[${startStr}] ${transcription.text.trim()}\n`;
            }
          } catch (whErr) {
            console.warn(`[Webhook Pipeline] Groq Whisper chunk ${i + 1} warning:`, whErr.message);
          } finally {
            if (chunk.path !== fullAudioPath && fs.existsSync(chunk.path)) {
              try { fs.unlinkSync(chunk.path); } catch { /* ignore */ }
            }
          }
        }
      }

      // Gemini Hook & Segment Extraction
      let geminiClips = [];
      if (process.env.GEMINI_API_KEY && transcriptionText) {
        try {
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

          const prompt = `You are an expert video editor and social media copywriter.
Analyze this video transcript:
Channel: "${channelName}"
Title: "${videoTitle}"
Transcript:
${transcriptionText}

Extract the top ${maxClips} most engaging, viral segments (duration 20 to 60 seconds each).
Return a JSON array of objects with:
[
  {
    "title": "catchy title",
    "hook": "1-sentence hook",
    "caption": "2-3 sentence context",
    "start_time": "00:00:15",
    "end_time": "00:00:55",
    "hashtags": ["#Shorts", "#Viral", "#Trending"]
  }
]`;

          const result = await model.generateContent([{ text: prompt }]);
          const resText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
          const parsed = JSON.parse(resText);
          if (Array.isArray(parsed)) geminiClips = parsed;
          else if (parsed.clips && Array.isArray(parsed.clips)) geminiClips = parsed.clips;
        } catch (llmErr) {
          console.warn('[Webhook Pipeline] Gemini segment extraction warning:', llmErr.message);
        }
      }

      // Groq LLM Fallback
      if (geminiClips.length === 0 && process.env.GROQ_API_KEY && transcriptionText) {
        try {
          const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
          const prompt = `You are an expert video editor and social media copywriter.
Analyze this video transcript:
Channel: "${channelName}"
Title: "${videoTitle}"
Transcript:
${transcriptionText}

Extract the top ${maxClips} most engaging, viral segments (duration 20 to 60 seconds each).
Return ONLY a valid JSON array of objects without markdown fences:
[
  {
    "title": "catchy title",
    "hook": "1-sentence hook",
    "caption": "2-3 sentence context",
    "start_time": "00:00:15",
    "end_time": "00:00:55",
    "hashtags": ["#Shorts", "#Viral", "#Trending"]
  }
]`;

          const chat = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'groq/compound-mini',
          });
          const rawContent = chat.choices[0]?.message?.content || '';
          const cleanedJson = rawContent
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
          const matchJson = cleanedJson.match(/\[[\s\S]*\]/);
          if (matchJson) {
            const parsed = JSON.parse(matchJson[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              geminiClips = parsed;
            }
          }
        } catch (groqLlmErr) {
          console.warn('[Webhook Pipeline] Groq LLM segment fallback warning:', groqLlmErr.message);
        }
      }

      if (geminiClips.length > 0) {
        highlightSegments = geminiClips.slice(0, maxClips).map((c, idx) => ({
          title: c.title || `Clip ${idx + 1}`,
          hook: c.hook || c.title || `Viral Highlight ${idx + 1}`,
          caption: c.caption || '',
          channelName,
          startTime: c.start_time || c.startTime || '00:00:00',
          endTime: c.end_time || c.endTime || secondsToTime(Math.min(30, totalDuration)),
          hashtags: Array.isArray(c.hashtags) ? c.hashtags : ['#Shorts', '#Viral', '#Trending'],
        }));
      } else {
        // Fallback: Smart automatic time window chunking
        const clipDuration = Math.min(30, Math.max(15, totalDuration / maxClips));
        const numToGenerate = Math.min(maxClips, Math.max(1, Math.floor(totalDuration / clipDuration)));

        for (let i = 0; i < numToGenerate; i++) {
          const sSec = i * clipDuration;
          const eSec = Math.min(totalDuration, (i + 1) * clipDuration);
          highlightSegments.push({
            title: `${videoTitle} - Part ${i + 1}`,
            hook: `Highlight Part ${i + 1}`,
            caption: `Exciting moment from ${channelName}`,
            channelName,
            startTime: secondsToTime(sSec),
            endTime: secondsToTime(eSec),
            hashtags: ['#Shorts', '#Viral', '#Trending'],
          });
        }
      }
    }

    console.log(`[Webhook Pipeline] [4/5] Preparing video for ${highlightSegments.length} clip(s)...`);

    // Ensure fullVideoPath exists for cutting segments
    if (!fs.existsSync(fullVideoPath) && url) {
      console.log(`[Webhook Pipeline] Downloading video source from ${url}...`);
      let downloadSuccess = false;
      let retries = 3;
      let currentClient = 'web';

      while (retries > 0 && !downloadSuccess) {
        try {
          const ytdlOptions = {
            output: fullVideoPath,
            format: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            ffmpegLocation: ffmpegInstaller.path,
            noCheckCertificates: true,
            noWarnings: true,
            noContinue: true,
          };
          if (currentClient === 'android') {
            ytdlOptions.extractorArgs = 'youtube:player_client=android';
          }
          await youtubedl(url, ytdlOptions);
          downloadSuccess = true;
        } catch (dlErr) {
          retries--;
          console.warn(`[Webhook Pipeline] Video download retry ${retries} (${currentClient}):`, dlErr.message);
          if (retries === 1) currentClient = 'android';
          if (retries === 0) throw dlErr;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    const savedClips = [];

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Render Clips (Tracking + Subtitles + B-Roll + BGM Ducking + SFX)
    // ─────────────────────────────────────────────────────────────────────────
    let clipIndex = 1;
    for (const seg of highlightSegments) {
      const clipId = crypto.randomUUID();
      const startSec = timeToSeconds(seg.startTime);
      const endSec = timeToSeconds(seg.endTime);
      const durationSec = Math.max(1, endSec - startSec);

      console.log(`[Webhook Pipeline] Processing clip ${clipIndex}/${highlightSegments.length} (${seg.startTime} -> ${seg.endTime}, ${durationSec.toFixed(1)}s)...`);

      const sourceClipPath = path.join(clipsDir, `${clipId}-source.mp4`);
      const rawClipPath = path.join(clipsDir, `${clipId}-raw.mp4`);
      const clipAudioPath = path.join(clipsDir, `${clipId}-clip-audio.mp3`);
      const assPath = path.join(clipsDir, `${clipId}-subtitle.ass`);
      const finalClipPath = path.join(clipsDir, `${clipId}-final.mp4`);

      // 1. Slice source 16:9 segment using fast input seeking
      await new Promise((resolve, reject) => {
        ffmpeg(fullVideoPath)
          .inputOptions(['-ss', String(startSec)])
          .duration(durationSec)
          .outputOptions(['-c:v libx264', '-crf 18', '-preset veryfast', '-c:a aac'])
          .output(sourceClipPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      // 2. Framing & Ratio: Split Screen vs Face Tracking vs Standard Crop
      let framedVideoPath = rawClipPath;
      const isMobile = ratio === '9:16' || ratio === 'mobile';

      if (isSplitScreen && isMobile) {
        console.log(`[Webhook Pipeline] Applying OpenCV Split Screen for clip ${clipIndex}...`);
        const splitOut = path.join(clipsDir, `${clipId}-splitscreen.mp4`);
        const splitRes = await runSplitScreenScript({
          inputPath: sourceClipPath,
          outputPath: splitOut,
        });
        if (splitRes.success && fs.existsSync(splitOut)) {
          framedVideoPath = splitOut;
        } else {
          // Fallback center crop
          await new Promise((resolve, reject) => {
            ffmpeg(sourceClipPath)
              .videoFilters(['crop=ih*9/16:ih:iw/2-ow/2:0,scale=1080:1920'])
              .outputOptions(['-c:v libx264', '-crf 18', '-preset veryfast', '-c:a copy'])
              .output(rawClipPath)
              .on('end', resolve)
              .on('error', reject)
              .run();
          });
        }
      } else if (isFaceTracking && isMobile) {
        console.log(`[Webhook Pipeline] Applying OpenCV Face Tracking for clip ${clipIndex}...`);
        const trackOut = path.join(clipsDir, `${clipId}-tracked.mp4`);
        const trackRes = await runFaceTrackingScript({
          inputPath: sourceClipPath,
          outputPath: trackOut,
          ratio: '9:16',
        });
        if (trackRes.success && fs.existsSync(trackOut)) {
          framedVideoPath = trackOut;
        } else {
          // Fallback center crop
          await new Promise((resolve, reject) => {
            ffmpeg(sourceClipPath)
              .videoFilters(['crop=ih*9/16:ih:iw/2-ow/2:0,scale=1080:1920'])
              .outputOptions(['-c:v libx264', '-crf 18', '-preset veryfast', '-c:a copy'])
              .output(rawClipPath)
              .on('end', resolve)
              .on('error', reject)
              .run();
          });
        }
      } else {
        // Standard crop/scale
        const filters = [];
        if (isMobile) {
          filters.push('crop=ih*9/16:ih:iw/2-ow/2:0,scale=1080:1920');
        } else {
          filters.push('scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
        }
        await new Promise((resolve, reject) => {
          ffmpeg(sourceClipPath)
            .videoFilters(filters)
            .outputOptions(['-c:v libx264', '-crf 18', '-preset veryfast', '-c:a copy'])
            .output(rawClipPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
      }

      // 3. Extract clip audio for subtitle timing
      let clipSegments = [];
      if (isSubtitles) {
        if (Array.isArray(seg.segments) && seg.segments.length > 0) {
          clipSegments = seg.segments;
        } else {
          await new Promise((resolve, reject) => {
            ffmpeg(framedVideoPath)
              .noVideo()
              .format('mp3')
              .output(clipAudioPath)
              .on('end', resolve)
              .on('error', reject)
              .run();
          });

          if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
            try {
              const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
              const transcriptionPromise = groq.audio.transcriptions.create({
                file: fs.createReadStream(clipAudioPath),
                model: 'whisper-large-v3',
                response_format: 'verbose_json',
                timestamp_granularities: ['word', 'segment'],
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Whisper request timeout (10s)')), 10000)
              );

              const transcription = await Promise.race([transcriptionPromise, timeoutPromise]);

              const rawSegs = Array.isArray(transcription.segments) ? transcription.segments : [];
              const globalWords = Array.isArray(transcription.words) ? transcription.words : [];

              clipSegments = rawSegs.map((s, i) => {
                let sWords = Array.isArray(s.words) && s.words.length > 0 ? s.words : [];
                if (sWords.length === 0 && globalWords.length > 0) {
                  sWords = globalWords.filter(
                    (w) => (w.start >= s.start - 0.15 || (w.start + w.end) / 2 >= s.start) &&
                           (w.start < s.end || (w.start + w.end) / 2 <= s.end)
                  );
                }
                const formattedWords = sWords
                  .map((w) => ({
                    word: (w.word || '').trim(),
                    start: Number(w.start),
                    end: Number(w.end),
                  }))
                  .filter((w) => w.word.length > 0);

                return {
                  id: i,
                  start: s.start,
                  end: s.end,
                  text: (s.text || '').trim(),
                  words: formattedWords,
                };
              });
            } catch (trErr) {
              console.warn(`[Webhook Pipeline] Whisper clip transcription warning:`, trErr.message);
            }
          }
        }

        // Subtitle fallback if Whisper produced no segments
        if (clipSegments.length === 0) {
          clipSegments = [
            {
              id: 0,
              start: 0,
              end: durationSec,
              text: seg.hook || seg.title,
              words: (seg.hook || seg.title).split(/\s+/).map((w, i, arr) => {
                const wDur = durationSec / Math.max(1, arr.length);
                return {
                  word: w,
                  start: Number((i * wDur).toFixed(2)),
                  end: Number(((i + 1) * wDur).toFixed(2)),
                };
              }),
            },
          ];
        }

        const { width, height } = await getVideoDimensions(framedVideoPath);

        generateAssSubtitleFile({
          assPath,
          segments: clipSegments,
          style: {
            font,
            size: resolvedFontSize,
            color,
            outline: true,
            shadow: true,
            animation: subtitleAnimation,
          },
          videoWidth: width,
          videoHeight: height,
        });
      }

      // 4. Auto B-Roll Overlays
      let overlays = [];
      if (isBrollEnabled) {
        overlays = detectAutoBroll(clipSegments, seg.hook || seg.title, brollTheme);
      }

      // 5. Audio ducking & Multi-stream filter rendering
      const relativeAssPath = isSubtitles && fs.existsSync(assPath)
        ? `public/clips/${clipId}-subtitle.ass`.replace(/\\/g, '/')
        : null;
      const { width: vW, height: vH } = await getVideoDimensions(framedVideoPath);

      const renderConfig = buildRenderComplexFilter({
        rawVideoPath: framedVideoPath,
        relativeAssPath,
        videoWidth: vW,
        videoHeight: vH,
        duration: durationSec,
        audioSettings: {
          bgmTrack: bgm || 'none',
          bgmVolume: 0.3,
          duckingEnabled: ducking !== 'none',
          duckingStrength: ducking || 'medium',
          sfxEnabled: isSfx,
          sfxVolume: 0.7,
        },
        brollSettings: {
          enabled: isBrollEnabled,
          theme: brollTheme,
          overlays,
        },
        segments: clipSegments,
      });

      // Execute FFmpeg
      try {
        await new Promise((resolve, reject) => {
          let command = ffmpeg();
          for (const inp of renderConfig.inputs) {
            command = command.input(inp);
          }
          command
            .complexFilter(renderConfig.filterComplex)
            .outputOptions([
              ...renderConfig.outputMap,
              '-c:v libx264',
              '-crf 18',
              '-preset veryfast',
              '-c:a aac',
              '-b:a 192k',
            ])
            .output(finalClipPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
      } catch (complexErr) {
        console.warn(`[Webhook Pipeline] Complex filter failed for clip ${clipIndex}, executing fallback render:`, complexErr.message);
        await new Promise((resolve, reject) => {
          let cmd = ffmpeg(framedVideoPath);
          if (isSubtitles && fs.existsSync(assPath) && relativeAssPath) {
            cmd = cmd.videoFilters([`subtitles=${relativeAssPath}`]);
          }
          cmd
            .outputOptions(['-c:v libx264', '-crf 18', '-preset veryfast', '-c:a aac'])
            .output(finalClipPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
      }

      // 6. Save clip to Database
      const videoPublicSrc = `/clips/${path.basename(finalClipPath)}`;
      const viralityScore = calculateViralityScore({
        hook: seg.hook || seg.title,
        title: seg.title,
        caption: seg.caption || '',
        duration: durationSec,
        segments: clipSegments,
      });

      const saved = saveClip({
        id: clipId,
        title: seg.title,
        videoPath: videoPublicSrc,
        duration: durationSec,
        hook: seg.hook || seg.title,
        caption: seg.caption || '',
        channelName: seg.channelName || channelName,
        startTime: seg.startTime,
        endTime: seg.endTime,
        hashtags: seg.hashtags || ['#Shorts', '#Viral', '#Trending'],
        viralityScore,
      });

      savedClips.push({
        ...saved,
        clipId: saved.id || clipId,
        videoUrl: videoPublicSrc,
        viralityScore,
      });

      // Clean intermediate files
      try {
        if (fs.existsSync(sourceClipPath)) fs.unlinkSync(sourceClipPath);
        if (fs.existsSync(rawClipPath) && rawClipPath !== framedVideoPath) fs.unlinkSync(rawClipPath);
        if (fs.existsSync(clipAudioPath)) fs.unlinkSync(clipAudioPath);
        if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
        const trackedPath = path.join(clipsDir, `${clipId}-tracked.mp4`);
        if (fs.existsSync(trackedPath)) fs.unlinkSync(trackedPath);
        const splitPath = path.join(clipsDir, `${clipId}-splitscreen.mp4`);
        if (fs.existsSync(splitPath)) fs.unlinkSync(splitPath);
      } catch (cleanupErr) {
        console.warn('[Webhook Pipeline] Cleanup warning:', cleanupErr.message);
      }

      clipIndex++;
    }

    // Clean full video files
    try {
      if (fs.existsSync(fullVideoPath)) fs.unlinkSync(fullVideoPath);
      if (fs.existsSync(fullAudioPath)) fs.unlinkSync(fullAudioPath);
    } catch (e) {
      console.warn('[Webhook Pipeline] Main file cleanup warning:', e.message);
    }

    const totalDurationMs = Date.now() - startTime;
    console.log(`[Webhook Pipeline] [5/5] Job ${jobId} completed successfully in ${totalDurationMs}ms! Generated ${savedClips.length} clips.`);

    addWebhookLog({
      id: jobId,
      type: 'inbound',
      event: 'clip.completed',
      status: 'success',
      statusCode: 200,
      url: url || localInputPath,
      callbackUrl: callbackUrl || '',
      durationMs: totalDurationMs,
      details: {
        clipCount: savedClips.length,
        clips: savedClips.map((c) => ({ id: c.id, clipId: c.id, title: c.title, videoUrl: c.videoUrl })),
      },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Direct Auto-Publish to Medsos (If requested)
    // ─────────────────────────────────────────────────────────────────────────
    if (autoPublish && autoPublish.enabled && savedClips.length > 0) {
      console.log(`[Webhook Pipeline] Auto-publishing ${savedClips.length} clip(s) to social platforms...`);
      const targetPlatforms = Array.isArray(autoPublish.platforms) && autoPublish.platforms.length > 0
        ? autoPublish.platforms
        : ['youtube'];
      const targetPrivacy = autoPublish.privacy || 'public';

      for (let i = 0; i < savedClips.length; i++) {
        const sc = savedClips[i];
        try {
          const pubRes = await publishToMultiplePlatforms({
            clipId: sc.id,
            clip: sc,
            filePath: sc.videoPath,
            videoUrl: sc.videoUrl,
            platforms: targetPlatforms,
            privacy: targetPrivacy,
          });
          savedClips[i] = {
            ...sc,
            publishResults: pubRes.results,
            publishStatus: pubRes.status,
          };
        } catch (pubErr) {
          console.warn(`[Webhook Pipeline] Auto-publish error for clip ${sc.id}:`, pubErr.message);
          savedClips[i] = {
            ...sc,
            publishStatus: 'failed',
            publishError: pubErr.message,
          };
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Dispatch Outbound Webhook Callback
    // ─────────────────────────────────────────────────────────────────────────
    if (callbackUrl) {
      console.log(`[Webhook Pipeline] Dispatching clip.completed event to ${callbackUrl}...`);
      const primaryClip = savedClips[0] || {};
      await dispatchWebhookEvent({
        callbackUrl,
        secret,
        event: 'clip.completed',
        data: {
          jobId,
          status: 'completed',
          totalDurationMs,
          url: url || localInputPath,
          ratio,
          channelName: primaryClip.channelName || channelName,
          videoTitle,
          clipId: primaryClip.id || null,
          videoUrl: primaryClip.videoUrl || null,
          title: primaryClip.title || null,
          hook: primaryClip.hook || null,
          caption: primaryClip.caption || null,
          duration: primaryClip.duration || 0,
          startTime: primaryClip.startTime || null,
          endTime: primaryClip.endTime || null,
          hashtags: primaryClip.hashtags || [],
          clips: savedClips.map((c) => ({
            clipId: c.id,
            ...c,
          })),
        },
      });
    }

    return {
      success: true,
      jobId,
      status: 'completed',
      totalDurationMs,
      clips: savedClips,
    };
  } catch (error) {
    const totalDurationMs = Date.now() - startTime;
    console.error(`[Webhook Pipeline] Job ${jobId} failed:`, error);

    addWebhookLog({
      id: jobId,
      type: 'inbound',
      event: 'clip.failed',
      status: 'failed',
      statusCode: 500,
      url: url || localInputPath,
      callbackUrl: callbackUrl || '',
      durationMs: totalDurationMs,
      error: error.message,
    });

    if (callbackUrl) {
      console.log(`[Webhook Pipeline] Dispatching clip.failed event to ${callbackUrl}...`);
      await dispatchWebhookEvent({
        callbackUrl,
        secret,
        event: 'clip.failed',
        data: {
          jobId,
          status: 'failed',
          error: error.message,
          url: url || localInputPath,
          clipId: null,
          videoUrl: null,
          title: null,
          hook: null,
          caption: null,
          channelName: 'YouTube',
          duration: 0,
          startTime: null,
          endTime: null,
          hashtags: [],
          clips: [],
        },
      });
    }

    return {
      success: false,
      jobId,
      status: 'failed',
      error: error.message,
    };
  }
}
