import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

console.log('🧪 Starting Lip Tracking Integration Verification...');

// 1. Verify track_lip.py file exists
const scriptPath = path.join(process.cwd(), 'scripts', 'track_lip.py');
assert.ok(fs.existsSync(scriptPath), 'scripts/track_lip.py missing');
console.log('✓ scripts/track_lip.py exists');

// 2. Verify API routes
const apiRoutePath = path.join(process.cwd(), 'app', 'api', 'lip-track', 'route.js');
assert.ok(fs.existsSync(apiRoutePath), 'app/api/lip-track/route.js missing');
console.log('✓ app/api/lip-track/route.js exists');

// 3. Test script execution with --help
const checkHelp = () =>
  new Promise((resolve, reject) => {
    const py = spawn('python', [scriptPath, '--help']);
    let out = '';
    py.stdout.on('data', (d) => (out += d.toString()));
    py.on('close', (code) => {
      if (code === 0 && out.includes('Lip Tracking')) {
        resolve(true);
      } else {
        reject(new Error(`track_lip.py --help failed with code ${code}`));
      }
    });
  });

await checkHelp();
console.log('✓ scripts/track_lip.py CLI interface verified');

console.log('\n🎉 ALL LIP TRACKING INTEGRATION TESTS PASSED SUCCESSFULLY!');
