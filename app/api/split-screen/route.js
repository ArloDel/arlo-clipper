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

    const splitFileName = `${clipId}-splitscreen.mp4`;
    const splitFilePath = path.join(clipsDir, splitFileName);
    const splitPublicUrl = `/clips/${splitFileName}`;

    // Return cached split video if already generated
    if (fs.existsSync(splitFilePath)) {
      return NextResponse.json({
        success: true,
        splitScreenVideoPath: splitPublicUrl,
        trackedVideoPath: splitPublicUrl,
        cached: true,
      });
    }

    // Determine input file: prefer full landscape source (16:9) for widest field of view
    const rawInputRelative = (sourceVideoPath || videoPath).replace(/^\//, '');
    const inputFilePath = path.join(process.cwd(), 'public', rawInputRelative);

    if (!fs.existsSync(inputFilePath)) {
      return NextResponse.json(
        { error: `Input video file not found at ${inputFilePath}` },
        { status: 404 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'track_split_screen.py');
    const ffmpegPath = ffmpegInstaller.path;

    const args = [
      scriptPath,
      '--input', inputFilePath,
      '--output', splitFilePath,
      '--ffmpeg', ffmpegPath,
      '--alpha', '0.08',
      '--divider',
    ];

    console.log(`[Split Screen API] Running: python ${args.join(' ')}`);

    const runSplitProcessor = () =>
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
            reject(new Error(`Python podcast split failed with code ${code}: ${stderr || stdout}`));
          }
        });

        pyProcess.on('error', (err) => {
          reject(err);
        });
      });

    const result = await runSplitProcessor();

    return NextResponse.json({
      success: true,
      splitScreenVideoPath: splitPublicUrl,
      trackedVideoPath: splitPublicUrl,
      details: result,
    });
  } catch (error) {
    console.error('Split Screen Error:', error);
    return NextResponse.json(
      { error: error.message || 'Podcast split screen processing failed' },
      { status: 500 }
    );
  }
}
