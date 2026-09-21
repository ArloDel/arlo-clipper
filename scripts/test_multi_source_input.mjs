import assert from 'assert';
import {
  extractGoogleDriveId,
  getGoogleDriveDirectLink,
  getDropboxDirectLink,
  detectSourceType,
  resolveSource,
  sanitizeFileName,
  SUPPORTED_VIDEO_EXTENSIONS,
} from '../lib/sourceResolver.js';

console.log('=== 📁 Starting Multi-Source Video Input Test Suite ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Google Drive URL Resolution & File ID Extraction
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 1: Google Drive URL Resolution ---');

const gdriveUrls = [
  {
    url: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=sharing',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/file/u/0/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/file/u/1/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=drivesdk',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/uc?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs&export=download',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://docs.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/edit',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
  {
    url: 'https://drive.google.com/drive/u/0/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs?usp=sharing',
    expectedId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
  },
];

for (const { url, expectedId } of gdriveUrls) {
  const extractedId = extractGoogleDriveId(url);
  assert.strictEqual(extractedId, expectedId, `Failed to extract ID from ${url}`);

  const directLink = getGoogleDriveDirectLink(url);
  assert.ok(directLink.includes(`id=${expectedId}`), `Direct link should contain id=${expectedId}`);
  assert.ok(directLink.startsWith('https://drive.google.com/uc?export=download'), 'Direct link should format correctly');
  assert.ok(directLink.includes('confirm=t'), 'Direct link should contain confirm=t');
}

const resolvedGdrive = resolveSource('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=sharing');
assert.strictEqual(resolvedGdrive.sourceType, 'google-drive');
assert.strictEqual(resolvedGdrive.platformName, 'Google Drive');
assert.strictEqual(resolvedGdrive.fileId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
assert.strictEqual(resolvedGdrive.isLocal, false);
assert.strictEqual(resolvedGdrive.isValid, true);
console.log('✓ Google Drive URL extraction and direct link conversion passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Dropbox URL Resolution (forcing dl=1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 2: Dropbox URL Resolution ---');

const dropboxTest1 = getDropboxDirectLink('https://www.dropbox.com/s/2mabc12345/zoom_interview.mp4?dl=0');
assert.ok(dropboxTest1.includes('dl=1'), 'Should replace dl=0 with dl=1');
assert.ok(!dropboxTest1.includes('dl=0'), 'Should remove dl=0');

const dropboxTest2 = getDropboxDirectLink('https://www.dropbox.com/scl/fi/xyz123/podcast_rec.mov?rlkey=abc987&dl=0');
assert.ok(dropboxTest2.includes('dl=1'), 'Should set dl=1 on scl fi format');
assert.ok(dropboxTest2.includes('rlkey=abc987'), 'Should retain rlkey');

const dropboxTest3 = getDropboxDirectLink('https://www.dropbox.com/s/2mabc12345/video.mp4');
assert.ok(dropboxTest3.includes('dl=1'), 'Should append dl=1 when missing');

const dropboxTest4 = getDropboxDirectLink('https://www.dropbox.com/s/2mabc12345/video.mp4?raw=1');
assert.ok(dropboxTest4.includes('dl=1'), 'Should set dl=1 and remove raw parameter');
assert.ok(!dropboxTest4.includes('raw=1'), 'Should remove raw=1');

const resolvedDropbox = resolveSource('https://www.dropbox.com/s/2mabc12345/zoom_interview.mp4?dl=0');
assert.strictEqual(resolvedDropbox.sourceType, 'dropbox');
assert.strictEqual(resolvedDropbox.platformName, 'Dropbox');
assert.ok(resolvedDropbox.resolvedUrl.includes('dl=1'), 'Resolved URL should have direct dl=1');
assert.strictEqual(resolvedDropbox.isLocal, false);
console.log('✓ Dropbox direct download link resolution passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: TikTok and YouTube Video Link Detection
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 3: TikTok and YouTube Detection ---');

const tiktokWeb = resolveSource('https://www.tiktok.com/@creator/video/7281928374829102938');
assert.strictEqual(tiktokWeb.sourceType, 'tiktok');
assert.strictEqual(tiktokWeb.platformName, 'TikTok');
assert.strictEqual(tiktokWeb.isLocal, false);

const tiktokShort = resolveSource('https://vt.tiktok.com/ZS2ABC123/');
assert.strictEqual(tiktokShort.sourceType, 'tiktok');
assert.strictEqual(tiktokShort.platformName, 'TikTok');

const tiktokMobile = resolveSource('https://m.tiktok.com/v/7281928374829102938.html');
assert.strictEqual(tiktokMobile.sourceType, 'tiktok');
assert.strictEqual(tiktokMobile.platformName, 'TikTok');

const ytStandard = resolveSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
assert.strictEqual(ytStandard.sourceType, 'youtube');
assert.strictEqual(ytStandard.fileId, 'dQw4w9WgXcQ');

const ytShorts = resolveSource('https://youtube.com/shorts/abcdef12345?feature=share');
assert.strictEqual(ytShorts.sourceType, 'youtube');
assert.strictEqual(ytShorts.fileId, 'abcdef12345');

const youtuBe = resolveSource('https://youtu.be/dQw4w9WgXcQ');
assert.strictEqual(youtuBe.sourceType, 'youtube');
assert.strictEqual(youtuBe.fileId, 'dQw4w9WgXcQ');
console.log('✓ TikTok and YouTube source resolution passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Direct Video Links (.mp4, .mov, .webm, .mkv, .ts)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 4: Direct Video Links ---');

const directMp4 = resolveSource('https://cdn.example.com/assets/podcasts/episode_42.mp4?token=123');
assert.strictEqual(directMp4.sourceType, 'direct-video');
assert.strictEqual(directMp4.platformName, 'Direct Video');
assert.strictEqual(directMp4.fileName, 'episode_42.mp4');

const directMov = resolveSource('https://storage.googleapis.com/bucket-demo/vlog_final.mov');
assert.strictEqual(directMov.sourceType, 'direct-video');
assert.strictEqual(directMov.fileName, 'vlog_final.mov');

const directTs = resolveSource('https://media.server.io/streams/broadcast.ts');
assert.strictEqual(directTs.sourceType, 'direct-video');
console.log('✓ Direct video URL identification passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Local File Upload Path Detection & Normalization (POSIX & Windows)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 5: Local File Path Detection ---');

const localUpload1 = resolveSource('/uploads/1726912345-zoom-meeting.mp4');
assert.strictEqual(localUpload1.sourceType, 'local-file');
assert.strictEqual(localUpload1.isLocal, true);
assert.strictEqual(localUpload1.localFilePath, '/uploads/1726912345-zoom-meeting.mp4');
assert.strictEqual(localUpload1.fileName, '1726912345-zoom-meeting.mp4');

const localUpload2 = resolveSource('public/uploads/podcast_interview.mov');
assert.strictEqual(localUpload2.sourceType, 'local-file');
assert.strictEqual(localUpload2.isLocal, true);
assert.strictEqual(localUpload2.localFilePath, '/uploads/podcast_interview.mov');

const localUploadWin1 = resolveSource('public\\uploads\\podcast_interview.mov');
assert.strictEqual(localUploadWin1.sourceType, 'local-file');
assert.strictEqual(localUploadWin1.isLocal, true);
assert.strictEqual(localUploadWin1.localFilePath, '/uploads/podcast_interview.mov');

const localUploadWin2 = resolveSource('uploads\\my_vlog.webm');
assert.strictEqual(localUploadWin2.sourceType, 'local-file');
assert.strictEqual(localUploadWin2.isLocal, true);
assert.strictEqual(localUploadWin2.localFilePath, '/uploads/my_vlog.webm');

const localAbsWin = resolveSource('D:\\kerji\\project\\public\\uploads\\meeting.mp4');
assert.strictEqual(localAbsWin.sourceType, 'local-file');
assert.strictEqual(localAbsWin.isLocal, true);

const localBareName = resolveSource('podcast_sample.mp4');
assert.strictEqual(localBareName.sourceType, 'local-file');
assert.strictEqual(localBareName.isLocal, true);
assert.strictEqual(localBareName.localFilePath, '/uploads/podcast_sample.mp4');

const localClip = resolveSource('/clips/12345-raw.mp4');
assert.strictEqual(localClip.sourceType, 'local-file');
assert.strictEqual(localClip.isLocal, true);
console.log('✓ Local file upload path resolution passed (POSIX and Windows paths)\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Filename Sanitization & Supported Extension Validation
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 6: Filename Sanitization ---');

const dirtyName1 = 'Zoom Meeting Recording: 21/09/2026? <Podcast> *Live* | Draft.mp4';
const clean1 = sanitizeFileName(dirtyName1);
assert.ok(!clean1.includes(':'), 'Should remove colons');
assert.ok(!clean1.includes('/'), 'Should remove slashes');
assert.ok(!clean1.includes('?'), 'Should remove question marks');
assert.ok(!clean1.includes('<'), 'Should remove brackets');
assert.ok(!clean1.includes('*'), 'Should remove asterisks');
assert.ok(!clean1.includes('|'), 'Should remove pipe');
console.log(`Cleaned name: "${clean1}"`);

assert.strictEqual(sanitizeFileName(''), 'video.mp4');
assert.strictEqual(sanitizeFileName(null), 'video.mp4');

// Supported extensions check
assert.ok(SUPPORTED_VIDEO_EXTENSIONS.includes('.mp4'));
assert.ok(SUPPORTED_VIDEO_EXTENSIONS.includes('.mov'));
assert.ok(SUPPORTED_VIDEO_EXTENSIONS.includes('.webm'));
assert.ok(SUPPORTED_VIDEO_EXTENSIONS.includes('.mkv'));
assert.ok(SUPPORTED_VIDEO_EXTENSIONS.includes('.ts'));
assert.ok(!SUPPORTED_VIDEO_EXTENSIONS.includes('.exe'));
assert.ok(!SUPPORTED_VIDEO_EXTENSIONS.includes('.txt'));
console.log('✓ Filename sanitization & extensions list verified\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Edge Cases & Robustness
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 7: Edge Cases & Robustness ---');

const emptyRes = resolveSource('');
assert.strictEqual(emptyRes.sourceType, 'unknown');
assert.strictEqual(emptyRes.isValid, false);

const nullRes = resolveSource(null);
assert.strictEqual(nullRes.sourceType, 'unknown');
assert.strictEqual(nullRes.isValid, false);

const numberRes = resolveSource(12345);
assert.strictEqual(numberRes.sourceType, 'unknown');

const whitespaceRes = resolveSource('   https://youtu.be/dQw4w9WgXcQ   ');
assert.strictEqual(whitespaceRes.sourceType, 'youtube');
assert.strictEqual(whitespaceRes.fileId, 'dQw4w9WgXcQ');

assert.strictEqual(extractGoogleDriveId('https://google.com/search?q=test'), null);
assert.strictEqual(extractGoogleDriveId(''), null);
assert.strictEqual(detectSourceType(''), 'unknown');
assert.strictEqual(detectSourceType(undefined), 'unknown');
console.log('✓ Robustness & edge cases passed\n');

console.log('🎉 ALL MULTI-SOURCE VIDEO INPUT TESTS PASSED SUCCESSFULLY! 100% PASS\n');

