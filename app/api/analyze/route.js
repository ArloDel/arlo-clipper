import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';

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

    console.log('[1/2] Downloading Audio for Gemini via yt-dlp...');
    
    await youtubedl(url, {
      output: audioPath,
      format: 'bestaudio[ext=m4a]/bestaudio/best',
      noCheckCertificates: true,
      noWarnings: true,
    });

    console.log('[2/2] Uploading and Analyzing Audio with Gemini 1.5...');
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const uploadResult = await fileManager.uploadFile(audioPath, {
      mimeType: 'audio/mp4',
      displayName: `Audio-${sessionId}`,
    });

    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
    const systemPrompt = `You are an expert video editor. Listen to the audio and find the top 3 most engaging, viral-worthy segments (15 to 45 seconds long each). Return ONLY a valid JSON array with EXACTLY 3 objects containing this exact structure:
[
  {
    "title": "A catchy title for the clip",
    "start_time": "00:00:00",
    "end_time": "00:00:30",
    "reason": "Why this clip is engaging"
  }
]`;

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

    console.log('Analysis complete! Cleaning up temporary files...');
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      await fileManager.deleteFile(uploadResult.file.name);
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
