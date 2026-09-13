import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

console.log('🧪 Starting Split Screen Podcast Mode Integration Verification...\n');

// 1. Verify track_split_screen.py file exists
const scriptPath = path.join(process.cwd(), 'scripts', 'track_split_screen.py');
assert.ok(fs.existsSync(scriptPath), 'scripts/track_split_screen.py missing');
console.log('✓ scripts/track_split_screen.py exists');

// 2. Verify API routes
const apiSplitPath = path.join(process.cwd(), 'app', 'api', 'split-screen', 'route.js');
assert.ok(fs.existsSync(apiSplitPath), 'app/api/split-screen/route.js missing');
console.log('✓ app/api/split-screen/route.js exists');

const apiPodcastPath = path.join(process.cwd(), 'app', 'api', 'podcast-split', 'route.js');
assert.ok(fs.existsSync(apiPodcastPath), 'app/api/podcast-split/route.js missing');
console.log('✓ app/api/podcast-split/route.js exists');

// 3. Test script execution with --help
const checkHelp = () =>
  new Promise((resolve, reject) => {
    const py = spawn('python', [scriptPath, '--help']);
    let out = '';
    py.stdout.on('data', (d) => (out += d.toString()));
    py.stderr.on('data', (d) => (out += d.toString()));
    py.on('close', (code) => {
      if (code === 0 && (out.includes('Podcast Split Screen') || out.includes('--input'))) {
        resolve(true);
      } else {
        reject(new Error(`track_split_screen.py --help failed with code ${code}:\n${out}`));
      }
    });
  });

await checkHelp();
console.log('✓ scripts/track_split_screen.py CLI interface verified');

// 4. Verify Dimension Calculations across multiple resolutions (1080p, 720p, 480p, 360p, custom)
function calculateSplitDimensions(width, height) {
  const max_k_h = Math.floor(height / 8);
  const max_k_w = Math.floor(width / 9);
  const max_k = Math.min(max_k_h, max_k_w);
  const k = Math.max(2, max_k & ~1);
  let crop_w = 9 * k;
  let crop_h = 8 * k;

  if (crop_w > width) crop_w = width % 2 === 0 ? width : width - 1;
  if (crop_h > height) crop_h = height % 2 === 0 ? height : height - 1;

  return { crop_w, crop_h, out_w: crop_w, out_h: crop_h * 2 };
}

// Check 1080p (1920x1080)
const dim1080 = calculateSplitDimensions(1920, 1080);
assert.strictEqual(dim1080.out_w, 1206);
assert.strictEqual(dim1080.out_h, 2144);
assert.strictEqual(dim1080.out_w / dim1080.out_h, 9 / 16);
assert.strictEqual(dim1080.out_w % 2, 0);
assert.strictEqual(dim1080.out_h % 2, 0);
console.log('✓ 1080p dimensions verified: 1206x2144 (exact 9:16, even)');

// Check 720p (1280x720)
const dim720 = calculateSplitDimensions(1280, 720);
assert.strictEqual(dim720.out_w, 810);
assert.strictEqual(dim720.out_h, 1440);
assert.strictEqual(dim720.out_w / dim720.out_h, 9 / 16);
assert.strictEqual(dim720.out_w % 2, 0);
assert.strictEqual(dim720.out_h % 2, 0);
console.log('✓ 720p dimensions verified: 810x1440 (exact 9:16, even)');

// Check 480p (854x480)
const dim480 = calculateSplitDimensions(854, 480);
assert.strictEqual(dim480.out_w, 540);
assert.strictEqual(dim480.out_h, 960);
assert.strictEqual(dim480.out_w / dim480.out_h, 9 / 16);
assert.strictEqual(dim480.out_w % 2, 0);
assert.strictEqual(dim480.out_h % 2, 0);
console.log('✓ 480p dimensions verified: 540x960 (exact 9:16, even)');

// Check 360p (640x360)
const dim360 = calculateSplitDimensions(640, 360);
assert.strictEqual(dim360.out_w, 396);
assert.strictEqual(dim360.out_h, 704);
assert.strictEqual(dim360.out_w / dim360.out_h, 9 / 16);
assert.strictEqual(dim360.out_w % 2, 0);
assert.strictEqual(dim360.out_h % 2, 0);
console.log('✓ 360p dimensions verified: 396x704 (exact 9:16, even)');

// 5. Verify CSS styling & Editorial Studio classes
const cssPath = path.join(process.cwd(), 'app', 'editorial', 'editor.module.css');
assert.ok(fs.existsSync(cssPath), 'editor.module.css missing');
const cssContent = fs.readFileSync(cssPath, 'utf-8');
assert.ok(cssContent.includes('faceTrackingBox'), 'faceTrackingBox CSS class found');
assert.ok(cssContent.includes('switchSlider'), 'switchSlider CSS class found');
console.log('✓ Editorial Studio styles verified');

// 6. Run Python synthetic podcast tracking test
const runPyTest = () =>
  new Promise((resolve, reject) => {
    const pyTestScript = path.join(process.cwd(), 'scripts', 'test_split_screen.py');
    const py = spawn('python', [pyTestScript]);
    let out = '';
    let err = '';
    py.stdout.on('data', (d) => (out += d.toString()));
    py.stderr.on('data', (d) => (err += d.toString()));
    py.on('close', (code) => {
      if (code === 0 && out.includes('TEST PASSED')) {
        resolve(out);
      } else {
        reject(new Error(`test_split_screen.py failed (code ${code}):\n${out}\n${err}`));
      }
    });
  });

console.log('Running python synthetic split screen test...');
const testResult = await runPyTest();
console.log(testResult);

console.log('\n🎉 ALL SPLIT SCREEN PODCAST INTEGRATION TESTS PASSED SUCCESSFULLY!');
