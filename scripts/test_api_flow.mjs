import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Test the face tracking script integration directly
async function testTrackingDirectly() {
  const clipsDir = path.join(process.cwd(), 'public', 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  const testInput = path.join(process.cwd(), 'scripts', 'test_out', 'test_input.mp4');
  const testOutput = path.join(clipsDir, 'test-clip-tracked.mp4');

  if (!fs.existsSync(testInput)) {
    console.error('Test input not found at', testInput);
    process.exit(1);
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'track_face.py');
  const ffmpegPath = ffmpegInstaller.path;

  const args = [
    scriptPath,
    '--input', testInput,
    '--output', testOutput,
    '--ffmpeg', ffmpegPath,
    '--ratio', '9:16',
    '--alpha', '0.08',
  ];

  console.log('Testing tracker execution with args:', args);

  const res = await new Promise((resolve, reject) => {
    const py = spawn('python', args);
    let stdout = '';
    let stderr = '';
    py.stdout.on('data', d => stdout += d.toString());
    py.stderr.on('data', d => stderr += d.toString());
    py.on('close', code => {
      if (code === 0) resolve(JSON.parse(stdout));
      else reject(new Error(`Failed code ${code}: ${stderr}`));
    });
  });

  console.log('Tracker result:', res);
  if (fs.existsSync(testOutput)) {
    console.log('Output file created successfully at:', testOutput);
    console.log('ALL API INTEGRATION TESTS PASSED!');
    // cleanup
    fs.unlinkSync(testOutput);
  } else {
    throw new Error('Output file was not generated!');
  }
}

testTrackingDirectly().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
