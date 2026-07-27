import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing in .env.local' }, { status: 500 });
    }

    const sessionId = uuidv4();
    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const audioPath = path.join(clipsDir, `${sessionId}-audio.m4a`);
    const videoPath = path.join(clipsDir, `${sessionId}-full.mp4`);
    const finalClipPath = path.join(clipsDir, `${sessionId}-highlight.mp4`);

    console.log('[1/4] Downloading Audio for Gemini...');
    await youtubedl(url, {
      output: audioPath,
      format: 'bestaudio[ext=m4a]',
      noCheckCertificates: true,
      noWarnings: true,
    });

    console.log('[2/4] Uploading and Analyzing Audio with Gemini 1.5 Flash...');
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Upload the audio file to Gemini
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

    // Prompt Gemini with the uploaded file
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

    console.log(`[3/4] Downloading Full Video... (Highlight found at ${startSec}s, duration: ${durationSec}s)`);
    await youtubedl(url, {
      output: videoPath,
      format: 'worst[ext=mp4]/worst', // Using worst quality to speed up local demo
      noCheckCertificates: true,
      noWarnings: true,
    });

    console.log('[4/4] Slicing Video with FFMPEG...');
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(startSec)
        .setDuration(durationSec)
        .output(finalClipPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    console.log('Processing complete! Cleaning up...');
    
    // Clean up temporary files
    try {
      fs.unlinkSync(audioPath);
      fs.unlinkSync(videoPath);
      // Optional: Delete from Gemini File Manager
      await fileManager.deleteFile(uploadResult.file.name);
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }

    return NextResponse.json({
      success: true,
      clips: [
        {
          id: 1,
          title: highlightData.title,
          duration: `0:${durationSec}`,
          score: highlightData.score,
          src: `/clips/${sessionId}-highlight.mp4`
        }
      ]
    });

  } catch (error) {
    console.error('Processing Error:', error);
    return NextResponse.json({ error: 'Processing failed', details: error.message }, { status: 500 });
  }
}
