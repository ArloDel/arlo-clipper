import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

export async function POST(request) {
  try {
    const { clipId, sourceVideoPath, videoPath, ratio = '9:16' } = await request.json();

    if (!clipId || (!sourceVideoPath && !videoPath)) {
      return NextResponse.json({ error: 'Missing clipId or videoPath' }, { status: 400 });
    }

    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    const trackedFileName = `${clipId}-tracked.mp4`;
    const trackedFilePath = path.join(clipsDir, trackedFileName);
    const trackedPublicUrl = `/clips/${trackedFileName}`;

    // Return cached tracked video if already generated
    if (fs.existsSync(trackedFilePath)) {
      return NextResponse.json({
        success: true,
        trackedVideoPath: trackedPublicUrl,
        cached: true,
      });
    }

    // Determine input file: prefer full source (16:9) for best tracking field of view
    const rawInputRelative = (sourceVideoPath || videoPath).replace(/^\//, '');
    const inputFilePath = path.join(process.cwd(), 'public', rawInputRelative);

    if (!fs.existsSync(inputFilePath)) {
      return NextResponse.json(
        { error: `Input video file not found at ${inputFilePath}` },
        { status: 404 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'track_face.py');
    const ffmpegPath = ffmpegInstaller.path;

    const args = [
      scriptPath,
      '--input', inputFilePath,
      '--output', trackedFilePath,
      '--ffmpeg', ffmpegPath,
      '--ratio', ratio,
      '--alpha', '0.08',
    ];

    console.log(`[Face Track API] Running: python ${args.join(' ')}`);

    const runTracker = () =>
      new Promise((resolve, reject) => {
        const pyProcess = spawn('python', args, { cwd: process.cwd() });

        let stdout = '';
        let stderr = '';

        pyProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        pyProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pyProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const res = JSON.parse(stdout.trim());
              resolve(res);
            } catch {
              resolve({ success: true, stdout });
            }
          } else {
            reject(new Error(`Python tracker failed with code ${code}: ${stderr || stdout}`));
          }
        });

        pyProcess.on('error', (err) => {
          reject(err);
        });
      });

    const result = await runTracker();

    return NextResponse.json({
      success: true,
      trackedVideoPath: trackedPublicUrl,
      details: result,
    });
  } catch (error) {
    console.error('Face Tracking Error:', error);
    return NextResponse.json(
      { error: 'Face tracking failed', details: error.message },
      { status: 500 }
    );
  }
}
