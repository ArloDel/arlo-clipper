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
import { calculateViralityScore } from '@/lib/viralityScore';
import { resolveSource } from '@/lib/sourceResolver';
import { downloadDirectStream } from '@/lib/sourceStreamer';

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
    const body = await request.json();
    const { url, localFilePath, fileName } = body;

    const targetInput = localFilePath || url;

    if (!targetInput) {
      return NextResponse.json(
        { error: 'Input video tidak valid. Masukkan URL video (YouTube, TikTok, Google Drive, Dropbox) atau upload file lokal.' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY || !process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'API Keys missing in .env.local' }, { status: 500 });
    }

    const sourceInfo = resolveSource(targetInput);

    if (!sourceInfo.isValid && sourceInfo.sourceType === 'unknown') {
      return NextResponse.json(
        { error: 'Format sumber video tidak dikenali. Pastikan link atau file yang diupload valid.' },
        { status: 400 }
      );
    }

    // --- 1. CACHING LAYER ---
    let cacheKey = '';
    if (sourceInfo.isLocal && sourceInfo.localFilePath) {
      const cleanBase = path.basename(sourceInfo.localFilePath).replace(/[^a-zA-Z0-9_-]/g, '_');
      cacheKey = `local_${cleanBase}`;
    } else if (sourceInfo.fileId) {
      cacheKey = `${sourceInfo.sourceType}_${sourceInfo.fileId}`;
    } else {
      const sanitizedUrl = (sourceInfo.resolvedUrl || targetInput).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 48);
      cacheKey = `${sourceInfo.sourceType}_${sanitizedUrl}`;
    }

    const cacheDir = path.join(process.cwd(), 'public', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
    if (fs.existsSync(cacheFile)) {
      console.log(`[Cache] Found cached result for ${cacheKey}. Skipping AI processing.`);
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return NextResponse.json({
        clips: cachedData.clips || cachedData,
        channelName: cachedData.channelName || sourceInfo.platformName,
        videoTitle: cachedData.videoTitle || fileName || 'Video',
        sourceType: sourceInfo.sourceType,
        localFilePath: sourceInfo.localFilePath || null,
      });
    }
    // ------------------------

    const sessionId = uuidv4();
    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const audioPath = path.join(clipsDir, `${sessionId}-audio.mp3`);
    let channelName = sourceInfo.platformName;
    let videoTitle = fileName || sourceInfo.fileName || `${sourceInfo.platformName} Video`;

    console.log(`[1/4] Preparing Audio for Whisper [Source: ${sourceInfo.sourceType}, Platform: ${sourceInfo.platformName}]...`);

    if (sourceInfo.isLocal) {
      // Direct local file audio extraction via FFmpeg
      let fullDiskPath = sourceInfo.localFilePath;
      if (!fs.existsSync(fullDiskPath)) {
        fullDiskPath = path.join(process.cwd(), 'public', sourceInfo.localFilePath.replace(/^\//, ''));
      }
      if (!fs.existsSync(fullDiskPath)) {
        return NextResponse.json(
          { error: `File video lokal tidak ditemukan di server: ${sourceInfo.localFilePath}` },
          { status: 404 }
        );
      }

      console.log(`[Analyze] Extracting audio directly from local file: ${fullDiskPath}`);
      await new Promise((resolve, reject) => {
        ffmpeg(fullDiskPath)
          .noVideo()
          .format('mp3')
          .output(audioPath)
          .on('end', resolve)
          .on('error', (err) => {
            console.error('[Analyze] FFmpeg audio extraction failed:', err);
            reject(err);
          })
          .run();
      });

      channelName = 'Local Upload';
      if (!fileName) {
        videoTitle = path.basename(sourceInfo.localFilePath, path.extname(sourceInfo.localFilePath));
      }
    } else if (sourceInfo.sourceType === 'google-drive' || sourceInfo.sourceType === 'dropbox' || sourceInfo.sourceType === 'direct-video') {
      // Download remote stream (Google Drive direct link, Dropbox dl=1, direct video URL)
      const downloadTargetUrl = sourceInfo.resolvedUrl || sourceInfo.originalInput;
      const tempVideoPath = path.join(clipsDir, `${sessionId}-temp-download.mp4`);

      console.log(`[Analyze] Downloading direct stream from ${sourceInfo.platformName}: ${downloadTargetUrl}`);
      let streamDownloaded = false;

      try {
        await downloadDirectStream(downloadTargetUrl, tempVideoPath);
        streamDownloaded = true;
      } catch (streamErr) {
        console.warn(`[Analyze] Direct stream download failed (${streamErr.message}), trying yt-dlp fallback...`);
        try {
          await youtubedl(downloadTargetUrl, {
            output: tempVideoPath,
            format: 'best',
            noCheckCertificates: true,
            noWarnings: true,
          });
          streamDownloaded = true;
        } catch (ytdlErr) {
          console.error('[Analyze] Both direct stream & yt-dlp failed:', ytdlErr);
          throw new Error(`Gagal mengunduh video dari ${sourceInfo.platformName}: ${streamErr.message}`);
        }
      }

      if (streamDownloaded) {
        console.log(`[Analyze] Extracting audio from downloaded stream...`);
        await new Promise((resolve, reject) => {
          ffmpeg(tempVideoPath)
            .noVideo()
            .format('mp3')
            .output(audioPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        try {
          if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        } catch {}
      }
    } else {
      // YouTube, TikTok, or other web video platforms via yt-dlp
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
          };

          if (sourceInfo.sourceType === 'youtube') {
            ytdlOptions.extractorArgs = 'youtube:player_client=android';
          }

          await youtubedl(sourceInfo.resolvedUrl || targetInput, ytdlOptions);
          downloadSuccess = true;
        } catch (err) {
          dlRetries--;
          console.warn(`[Analyze] Audio download failed, retrying... (${dlRetries} left) - ${err.message}`);
          if (dlRetries === 0) throw err;
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Metadata extraction via yt-dlp
      try {
        const meta = await youtubedl(sourceInfo.resolvedUrl || targetInput, {
          dumpSingleJson: true,
          noWarnings: true,
          noCheckCertificates: true,
          preferFreeFormats: true,
          youtubeSkipDashManifest: true,
        });
        if (meta) {
          channelName = meta.uploader || meta.channel || meta.uploader_id || sourceInfo.platformName;
          videoTitle = meta.title || videoTitle;
        }
      } catch (e) {
        console.warn('[Analyze] Fast metadata extraction fallback:', e.message);
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
      console.log(`Transcribing chunk ${i + 1}/${chunks.length} (Offset: ${chunk.offset}s)`);

      try {
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(chunk.path),
          model: 'whisper-large-v3',
          response_format: 'verbose_json',
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
        if (chunk.path !== audioPath && fs.existsSync(chunk.path)) {
          try { fs.unlinkSync(chunk.path); } catch (e) { console.warn("Cleanup error:", e); }
        }
      }
    }

    console.log('[4/4] Analyzing text transcript with Gemini Flash...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    const totalDurationSec = Math.max(1, Math.round(duration || 60));
    const maxSegmentDuration = totalDurationSec < 40 ? totalDurationSec : 60;
    const minSegmentDuration = totalDurationSec < 30 ? Math.max(5, Math.floor(totalDurationSec / 2)) : 30;

    const systemPrompt = `You are an expert video editor and social media copywriter.
Read the following video transcript containing timestamps.
Platform / Source: "${sourceInfo.platformName}"
Channel / Author Name: "${channelName}"
Video Title: "${videoTitle}"
Total Video Duration: ${totalDurationSec} seconds (${secondsToTime(totalDurationSec)})

Find the top 3 most engaging, viral-worthy segments (between ${minSegmentDuration} and ${maxSegmentDuration} seconds long each, staying strictly within 00:00:00 to ${secondsToTime(totalDurationSec)}).
For each segment, craft high-engagement copywriting (viral hook, caption, and hashtags) for social media (YouTube Shorts, TikTok, Instagram Reels) matching the transcript's language.

Return ONLY a valid JSON array with EXACTLY 3 objects containing this exact structure:
[
  {
    "title": "A catchy title for the clip",
    "hook": "An attention-grabbing 1-sentence viral hook for the first 3 seconds",
    "caption": "An engaging 2-3 sentence description explaining the context and sparking discussion",
    "channel_name": "${channelName}",
    "start_time": "00:00:00",
    "end_time": "${secondsToTime(Math.min(totalDurationSec, 35))}",
    "hashtags": ["#Shorts", "#Viral", "#Trending", "#TopicTag1", "#TopicTag2"],
    "reason": "Why this moment is engaging"
  }
]
IMPORTANT:
- Segments must never exceed total video duration of ${secondsToTime(totalDurationSec)}.
- Language: Write the hook, caption, and title in the SAME language as the transcript (e.g., Indonesian if Indonesian, English if English).
- Hashtags must be an array of string tags starting with #.`;

    let highlightData = [];
    let retries = 3;

    while (retries > 0) {
      try {
        const result = await model.generateContent([
          { text: systemPrompt },
          { text: fullTranscript || 'Video without transcript' }
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
        console.warn(`[Analyze] Gemini LLM parsing error, retrying in ${waitTime / 1000}s... (${retries - 1} left) - ${error.message}`);
        await new Promise(r => setTimeout(r, waitTime));
        retries--;
        if (retries === 0) throw error;
      }
    }

    highlightData = highlightData.map((c, idx) => {
      const hook = c.hook || c.title || `Clip ${idx + 1}`;
      const title = c.title || `Clip ${idx + 1}`;
      const caption = c.caption || '';
      const hashtags = Array.isArray(c.hashtags) ? c.hashtags : ['#Shorts', '#Viral', '#Trending'];
      const channel = c.channel_name || c.channelName || channelName;
      const viralityScore = calculateViralityScore({
        hook,
        title,
        caption,
        duration: Math.min(totalDurationSec, 35),
      });

      return {
        ...c,
        channelName: channel,
        hook,
        caption,
        hashtags,
        viralityScore,
      };
    });

    console.log('Analysis complete! Saving to cache...');
    const cachePayload = {
      clips: highlightData,
      channelName,
      videoTitle,
      sourceType: sourceInfo.sourceType,
      localFilePath: sourceInfo.localFilePath || null,
    };
    fs.writeFileSync(cacheFile, JSON.stringify(cachePayload, null, 2));

    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }

    return NextResponse.json({
      clips: highlightData,
      channelName,
      videoTitle,
      sourceType: sourceInfo.sourceType,
      localFilePath: sourceInfo.localFilePath || null,
    });
  } catch (error) {
    console.error('Analysis Error:', error);
    return NextResponse.json({ error: 'Analysis failed', details: error.message }, { status: 500 });
  }
}
