import assert from 'assert';
import {
  getClipPublishStatus,
  checkDuplicatePublish,
  getClipsPublishMap,
  getPublishHistory,
  recordPublishHistory,
} from '../lib/socialPublishers.js';
import {
  getAllClips,
  getPaginatedClips,
  saveClip,
  deleteClip,
  getDb,
} from '../lib/db.js';

console.log('🧪 Starting Publish Status, Filter & Anti-Duplicate Test Suite...\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Status Badge & Publish Status Tracker
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 1: Publish Status Tracker & Links ---');

// Known published clip in data/publishHistory.json
const knownPublishedClipId = 'ab7df07e-95be-43e9-9bdf-2e13dbc58d68';
const pubStatus = getClipPublishStatus(knownPublishedClipId);

console.log('Published Clip Status:', {
  isPublished: pubStatus.isPublished,
  platforms: pubStatus.platforms,
  primaryPlatform: pubStatus.primaryPlatform,
  primaryUrl: pubStatus.primaryUrl,
  formattedLabel: pubStatus.formattedLabel,
});

assert.strictEqual(pubStatus.isPublished, true, 'Known clip should be published');
assert.ok(pubStatus.platforms.includes('youtube'), 'Should include YouTube platform');
assert.strictEqual(pubStatus.primaryPlatform, 'youtube');
assert.ok(pubStatus.primaryUrl && pubStatus.primaryUrl.includes('youtube.com/shorts/'), 'Should have YouTube Shorts link');
assert.ok(pubStatus.formattedLabel.includes('Published on YouTube'), 'Formatted label should mention YouTube');

// Test unpublished clip
const unknownClipId = 'unpub_test_' + Date.now();
const unpubStatus = getClipPublishStatus(unknownClipId);

console.log('Unpublished Clip Status:', unpubStatus);
assert.strictEqual(unpubStatus.isPublished, false, 'Unknown clip should be unpublished');
assert.strictEqual(unpubStatus.formattedLabel, 'Unpublished');
assert.strictEqual(unpubStatus.primaryUrl, null);
assert.deepStrictEqual(unpubStatus.platforms, []);

console.log('✓ Test 1 Passed: Status tracker accurately identifies published & unpublished clips!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Anti-Duplicate Detection & Warning Messages
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 2: Anti-Duplicate Protection & Warning Messages ---');

// Check duplicate for existing YouTube clip
const dupCheckYT = checkDuplicatePublish(knownPublishedClipId, ['youtube']);
console.log('Duplicate check (YouTube):', dupCheckYT);

assert.strictEqual(dupCheckYT.isDuplicate, true, 'Should detect duplicate for YouTube');
assert.strictEqual(dupCheckYT.platformName, 'YouTube');
assert.ok(dupCheckYT.warningMessage.includes('Video ini sudah pernah diunggah ke YouTube'), 'Warning message format check');
assert.ok(dupCheckYT.dateText, 'Date text should be formatted in Indonesian');
assert.ok(dupCheckYT.videoUrl, 'Video URL should be present');

// Check duplicate for TikTok (not yet published to TikTok)
const dupCheckTT = checkDuplicatePublish(knownPublishedClipId, ['tiktok']);
console.log('Duplicate check (TikTok for YT-only clip):', dupCheckTT);
assert.strictEqual(dupCheckTT.isDuplicate, false, 'Should not detect duplicate for unpublished platform');

// Check duplicate for unrecorded clip
const dupCheckUnpublished = checkDuplicatePublish('random_clip_id_not_in_history', ['youtube']);
assert.strictEqual(dupCheckUnpublished.isDuplicate, false);
assert.strictEqual(dupCheckUnpublished.warningMessage, null);

console.log('✓ Test 2 Passed: Anti-duplicate detector generates accurate warnings with video links & dates!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Multi-Platform Matching & Resolution by VideoPath / Title
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 3: Resolution by Path & Multi-Platform History ---');

const testClipId = 'multi_test_' + Date.now();
const testVideoPath = '/clips/sample_multi_test.mp4';
const testTitle = 'Cara Cepat Belajar Next.js 16';

// Record multi-platform publish
recordPublishHistory({
  clipId: testClipId,
  clipTitle: testTitle,
  videoPath: testVideoPath,
  platforms: ['youtube', 'tiktok', 'instagram'],
  status: 'success',
  results: {
    youtube: {
      success: true,
      platform: 'youtube',
      videoId: 'yt_abc123',
      videoUrl: 'https://www.youtube.com/shorts/yt_abc123',
      status: 'public',
    },
    tiktok: {
      success: true,
      platform: 'tiktok',
      publishId: 'tt_xyz789',
      status: 'processing',
    },
    instagram: {
      success: true,
      platform: 'instagram',
      mediaId: 'ig_45678',
      postUrl: 'https://www.instagram.com/reel/sample123/',
      status: 'published',
    },
  },
});

// Look up by clip object
const statusByObj = getClipPublishStatus({ id: testClipId, videoPath: testVideoPath, title: testTitle });
assert.strictEqual(statusByObj.isPublished, true);
assert.strictEqual(statusByObj.platforms.length, 3);
assert.ok(statusByObj.platforms.includes('youtube'));
assert.ok(statusByObj.platforms.includes('tiktok'));
assert.ok(statusByObj.platforms.includes('instagram'));
assert.ok(statusByObj.formattedLabel.includes('Published on YouTube (+2)'));

// Look up by video path alone
const statusByPath = getClipPublishStatus({ videoPath: testVideoPath });
assert.strictEqual(statusByPath.isPublished, true);

// Check duplicate for Instagram
const dupCheckIG = checkDuplicatePublish(testClipId, ['instagram']);
assert.strictEqual(dupCheckIG.isDuplicate, true);
assert.strictEqual(dupCheckIG.platformName, 'Instagram');
assert.ok(dupCheckIG.warningMessage.includes('Video ini sudah pernah diunggah ke Instagram'));
assert.ok(dupCheckIG.videoUrl.includes('instagram.com/reel/'));

console.log('✓ Test 3 Passed: Multi-platform tracking, path resolution, and multi-badge labeling verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Filter Logic in db.js (all, published, unpublished)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 4: Clip Filter Logic & Pagination ---');

// Insert temporary test clips: one published, one unpublished
const savedClipPub = saveClip({
  id: testClipId,
  title: testTitle,
  videoPath: testVideoPath,
  duration: 35,
});

const unpubClipId = 'temp_unpub_' + Date.now();
const savedClipUnpub = saveClip({
  id: unpubClipId,
  title: 'Unpublished Fresh Clip',
  videoPath: '/clips/unpub_fresh.mp4',
  duration: 40,
});

// Test getAllClips with filters
const allClips = getAllClips('all');
const publishedClips = getAllClips('published');
const unpublishedClips = getAllClips('unpublished');

console.log(`Clips summary - All: ${allClips.length}, Published: ${publishedClips.length}, Unpublished: ${unpublishedClips.length}`);

assert.ok(allClips.length >= 2, 'Should have at least 2 clips in all');
assert.strictEqual(allClips.length, publishedClips.length + unpublishedClips.length, 'all = published + unpublished');

// Check that publishedClips contains our published clip
assert.ok(publishedClips.some((c) => c.id === testClipId), 'Published list should contain published clip');
assert.ok(!publishedClips.some((c) => c.id === unpubClipId), 'Published list should not contain unpublished clip');

// Check that unpublishedClips contains our unpublished clip
assert.ok(unpublishedClips.some((c) => c.id === unpubClipId), 'Unpublished list should contain unpublished clip');
assert.ok(!unpublishedClips.some((c) => c.id === testClipId), 'Unpublished list should not contain published clip');

// Test getPaginatedClips
const paginatedAll = getPaginatedClips(1, 9, 'all');
assert.strictEqual(paginatedAll.counts.all, allClips.length);
assert.strictEqual(paginatedAll.counts.published, publishedClips.length);
assert.strictEqual(paginatedAll.counts.unpublished, unpublishedClips.length);
assert.ok(Array.isArray(paginatedAll.clips));
assert.ok(paginatedAll.clips.every((c) => c.publishStatus !== undefined), 'Each clip must have publishStatus attached');

const paginatedUnpub = getPaginatedClips(1, 9, 'unpublished');
assert.ok(paginatedUnpub.clips.every((c) => c.publishStatus.isPublished === false), 'All clips in unpublished filter must have isPublished=false');

const paginatedPub = getPaginatedClips(1, 9, 'published');
assert.ok(paginatedPub.clips.every((c) => c.publishStatus.isPublished === true), 'All clips in published filter must have isPublished=true');

// Clean up temporary test clips
deleteClip(testClipId);
deleteClip(unpubClipId);

console.log('✓ Test 4 Passed: Library clip filtering, counts, and pagination verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Edge Cases & Robustness
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 5: Edge Cases & Resilience ---');

// Null/empty inputs
assert.strictEqual(getClipPublishStatus(null).isPublished, false);
assert.strictEqual(getClipPublishStatus('').isPublished, false);
assert.strictEqual(getClipPublishStatus({}).isPublished, false);
assert.strictEqual(checkDuplicatePublish(null).isDuplicate, false);
assert.strictEqual(checkDuplicatePublish({}).isDuplicate, false);

// Empty targetPlatforms array fallback
const emptyPlatformCheck = checkDuplicatePublish(knownPublishedClipId, []);
assert.strictEqual(emptyPlatformCheck.isDuplicate, false);

// Bulk lookup map
const clipsMap = getClipsPublishMap([knownPublishedClipId, 'non_existent_id']);
assert.ok(clipsMap[knownPublishedClipId], 'Map should contain known clip status');
assert.strictEqual(clipsMap[knownPublishedClipId].isPublished, true);
assert.strictEqual(clipsMap['non_existent_id'].isPublished, false);

console.log('✓ Test 5 Passed: Edge cases, null-safety, and bulk mapping verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: VideoId Fallback & URL Construction
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 6: VideoId Fallback & URL Construction ---');

const fallbackClipId = 'fallback_yt_' + Date.now();
const testHistoryWithVideoIdOnly = [
  {
    clipId: fallbackClipId,
    clipTitle: 'VideoId Only Test',
    timestamp: new Date().toISOString(),
    status: 'success',
    results: {
      youtube: {
        success: true,
        platform: 'youtube',
        videoId: 'short_id_xyz999',
        status: 'public',
      },
    },
  },
];

const fallbackStatus = getClipPublishStatus(fallbackClipId, testHistoryWithVideoIdOnly);
assert.strictEqual(fallbackStatus.isPublished, true);
assert.strictEqual(fallbackStatus.primaryPlatform, 'youtube');
assert.strictEqual(fallbackStatus.primaryUrl, 'https://www.youtube.com/shorts/short_id_xyz999');

const dupFallback = checkDuplicatePublish(fallbackClipId, ['youtube'], testHistoryWithVideoIdOnly);
assert.strictEqual(dupFallback.isDuplicate, true);
assert.strictEqual(dupFallback.videoUrl, 'https://www.youtube.com/shorts/short_id_xyz999');

console.log('✓ Test 6 Passed: VideoId fallback properly constructs YouTube Shorts URL!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Cross-Platform Path Formats in Duplicate Detection
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 7: Cross-Platform Video Path Formats ---');

const winPathHistory = [
  {
    clipId: null,
    clipTitle: 'Windows Path Video',
    videoPath: 'D:\\exports\\clips\\subfolder\\my_viral_video.mp4',
    timestamp: new Date().toISOString(),
    status: 'success',
    results: {
      youtube: {
        success: true,
        platform: 'youtube',
        videoId: 'yt_win_123',
        videoUrl: 'https://www.youtube.com/shorts/yt_win_123',
        status: 'public',
      },
    },
  },
];

// Query with posix-style path for the same video filename
const posixStatus = getClipPublishStatus({ videoPath: '/public/clips/my_viral_video.mp4' }, winPathHistory);
assert.strictEqual(posixStatus.isPublished, true);
assert.strictEqual(posixStatus.primaryUrl, 'https://www.youtube.com/shorts/yt_win_123');

const posixDup = checkDuplicatePublish({ videoPath: '/public/clips/my_viral_video.mp4' }, ['youtube'], winPathHistory);
assert.strictEqual(posixDup.isDuplicate, true);
assert.strictEqual(posixDup.platformName, 'YouTube');

console.log('✓ Test 7 Passed: Cross-platform slash normalization verified!');

console.log('\n🎉 ALL PUBLISH FILTER & ANTI-DUPLICATE TESTS PASSED SUCCESSFULLY!');
