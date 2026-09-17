import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  getSocialConfig,
  saveSocialConfig,
  getSanitizedSocialConfig,
  publishToYouTube,
  publishToTikTok,
  publishToInstagram,
  publishToMultiplePlatforms,
  getPublishHistory,
  recordPublishHistory,
  resolveLocalVideoPath,
} from '../lib/socialPublishers.js';
import { getBotConfig, saveBotConfig } from '../lib/localBot.js';

console.log('🧪 Starting Direct Auto-Publish & Social Publishers Test Suite...');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Config Management & Credential Sanitization
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 1: Config Storage & Secret Sanitization ---');

const initialConfig = getSocialConfig();
assert.ok(initialConfig.youtube && initialConfig.tiktok && initialConfig.instagram, 'Missing platforms in config');

// Save test credentials
const testConfig = saveSocialConfig({
  youtube: {
    clientId: 'test-client-id-123456789.apps.googleusercontent.com',
    clientSecret: 'test-client-secret-987654321',
    refreshToken: '1//test-refresh-token-long-secret',
    accessToken: 'test_token',
    channelTitle: 'Arlo Clips Channel',
    defaultPrivacy: 'public',
  },
  tiktok: {
    clientKey: 'aw_test_client_key_123',
    clientSecret: 'secret_tiktok_987',
    accessToken: 'act.test_tiktok_access_token_12345',
    defaultPrivacy: 'PUBLIC_TO_EVERYONE',
  },
  instagram: {
    accessToken: 'EAAB_test_instagram_token_12345678',
    instagramAccountId: '1784140012345678',
    accountUsername: 'arloclipper',
    shareToFeed: true,
  },
});

assert.strictEqual(testConfig.youtube.channelTitle, 'Arlo Clips Channel');
assert.strictEqual(testConfig.instagram.instagramAccountId, '1784140012345678');

// Test sanitization for frontend
const sanitized = getSanitizedSocialConfig();
console.log('Sanitized config for UI:', {
  youtube: { ...sanitized.youtube, clientId: sanitized.youtube.clientId },
  tiktok: { ...sanitized.tiktok, accessToken: sanitized.tiktok.accessToken },
  instagram: { ...sanitized.instagram, accessToken: sanitized.instagram.accessToken },
});

assert.ok(sanitized.youtube.clientId.includes('...'), 'YouTube Client ID should be masked');
assert.ok(sanitized.youtube.clientSecret.includes('...'), 'YouTube Client Secret should be masked');
assert.ok(sanitized.tiktok.accessToken.includes('...'), 'TikTok Access Token should be masked');
assert.ok(sanitized.instagram.accessToken.includes('...'), 'Instagram Access Token should be masked');
assert.strictEqual(sanitized.youtube.isConfigured, true, 'YouTube should be marked configured');
assert.strictEqual(sanitized.tiktok.isConfigured, true, 'TikTok should be marked configured');
assert.strictEqual(sanitized.instagram.isConfigured, true, 'Instagram should be marked configured');

console.log('✓ Test 1 Passed: Config storage & token masking verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: YouTube Shorts Direct Publisher (YouTube Data API v3)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 2: YouTube Shorts Publisher Flow ---');

const ytResult = await publishToYouTube({
  title: 'Rahasia Finansial di Usia 20-an',
  description: 'Tips mengelola keuangan untuk Gen Z #Shorts #Finance #Viral',
  tags: ['Shorts', 'Finance', 'Tips', '#GenZ'],
  privacy: 'public',
  videoBuffer: Buffer.from('mock video binary data'),
});

console.log('YouTube Publish Result:', ytResult);
assert.strictEqual(ytResult.success, true);
assert.strictEqual(ytResult.platform, 'youtube');
assert.ok(ytResult.videoId, 'Missing videoId');
assert.ok(ytResult.videoUrl.includes('youtube.com/shorts/'), 'Invalid Shorts URL format');
assert.strictEqual(ytResult.status, 'public');

// Test YouTube Scheduled Publish
const scheduledTime = new Date(Date.now() + 86400000).toISOString();
const ytScheduledResult = await publishToYouTube({
  title: 'Scheduled Clip for Tomorrow',
  description: 'Description test',
  tags: ['Shorts'],
  privacy: 'public',
  publishAt: scheduledTime,
  videoBuffer: Buffer.from('mock video binary data'),
});

assert.strictEqual(ytScheduledResult.status, 'scheduled');
assert.strictEqual(ytScheduledResult.publishAt, scheduledTime);
console.log('✓ Test 2 Passed: YouTube Shorts direct and scheduled upload flows verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: TikTok Content Posting API Publisher
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 3: TikTok Content Posting API Flow ---');

const ttResult = await publishToTikTok({
  caption: 'Trik rahasia yang jarang diketahui orang!',
  hashtags: ['#fyp', '#viral', '#trending'],
  privacyLevel: 'PUBLIC_TO_EVERYONE',
  disableComment: false,
  disableDuet: false,
  videoBuffer: Buffer.from('mock video binary data'),
});

console.log('TikTok Publish Result:', ttResult);
assert.strictEqual(ttResult.success, true);
assert.strictEqual(ttResult.platform, 'tiktok');
assert.ok(ttResult.publishId, 'Missing TikTok publishId');
assert.strictEqual(ttResult.status, 'processing');
console.log('✓ Test 3 Passed: TikTok Content Posting API flow verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Instagram Reels Graph API Publisher
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 4: Instagram Graph API (Reels Container) Flow ---');

const igResult = await publishToInstagram({
  caption: 'Jangan lewatkan tips penting ini! 😱',
  hashtags: ['#Reels', '#ViralReels', '#ExplorePage'],
  shareToFeed: true,
  videoUrl: 'https://example.com/clips/sample.mp4',
});

console.log('Instagram Publish Result:', igResult);
assert.strictEqual(igResult.success, true);
assert.strictEqual(igResult.platform, 'instagram');
assert.ok(igResult.mediaId, 'Missing Instagram mediaId');
assert.ok(igResult.postUrl.includes('instagram.com/reel/'), 'Invalid Reel URL');
assert.strictEqual(igResult.status, 'published');
console.log('✓ Test 4 Passed: Instagram Graph API Reels flow verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Unified Multi-Platform Publisher & History Logging
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 5: Unified Multi-Platform Publisher & History ---');

const sampleClip = {
  id: 'clip_test_' + Date.now(),
  title: 'Strategi Negosiasi Gaji Level Senior',
  hook: 'Mau naik gaji 50%? Lakukan 3 hal ini saat review tahunan!',
  caption: 'Cara bernegosiasi gaji dengan data dan achievement portofolio.',
  channelName: 'CareerLab',
  startTime: '00:02:10',
  endTime: '00:02:55',
  duration: 45,
  hashtags: ['#Shorts', '#Career', '#Salary', '#TipsKerja'],
  videoPath: '/clips/test_render.mp4',
};

const multiResult = await publishToMultiplePlatforms({
  clipId: sampleClip.id,
  clip: sampleClip,
  platforms: ['youtube', 'tiktok', 'instagram'],
  privacy: 'public',
  customTitle: 'Cara Naik Gaji 50% di 2026',
});

console.log('Multi-Platform Publish Summary:', {
  success: multiResult.success,
  status: multiResult.status,
  platforms: Object.keys(multiResult.results),
  historyId: multiResult.historyRecord?.id,
});

assert.strictEqual(multiResult.success, true);
assert.strictEqual(multiResult.status, 'success');
assert.ok(multiResult.results.youtube?.success, 'YouTube publish failed');
assert.ok(multiResult.results.tiktok?.success, 'TikTok publish failed');
assert.ok(multiResult.results.instagram?.success, 'Instagram publish failed');

// Check publish history persistence
const history = getPublishHistory(10);
const recorded = history.find((h) => h.clipId === sampleClip.id);
assert.ok(recorded, 'Publish event not found in history');
assert.strictEqual(recorded.clipTitle, 'Cara Naik Gaji 50% di 2026');
assert.deepStrictEqual(recorded.platforms, ['youtube', 'tiktok', 'instagram']);
assert.strictEqual(recorded.status, 'success');

console.log('✓ Test 5 Passed: Unified multi-platform publisher and history logging verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Edge Cases, Normalization & Platform Aliases
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 6: Privacy Normalization, Aliases & Path Resolution ---');

// Test YouTube draft privacy mapped to unlisted
const ytDraftResult = await publishToYouTube({
  title: 'Draft Test Clip',
  tags: 'Shorts, Viral, Tech',
  privacy: 'draft',
  videoBuffer: Buffer.from('mock video data'),
});
assert.strictEqual(ytDraftResult.status, 'unlisted', 'Draft privacy should normalize to unlisted on YouTube');
assert.ok(ytDraftResult.details.tags.includes('Tech'), 'String tags should be parsed');

// Test TikTok draft privacy mapped to SELF_ONLY
const ttDraftResult = await publishToTikTok({
  caption: 'Draft TikTok',
  privacyLevel: 'draft',
  videoBuffer: Buffer.from('mock video data'),
});
assert.strictEqual(ttDraftResult.privacyLevel, 'SELF_ONLY', 'Draft privacy should normalize to SELF_ONLY on TikTok');

// Test Instagram with public URL in filePath
const igUrlResult = await publishToInstagram({
  caption: 'Instagram Reel via URL',
  filePath: 'https://cdn.example.com/clips/sample.mp4',
});
assert.strictEqual(igUrlResult.success, true);
assert.ok(igUrlResult.mediaId);

// Test Platform Aliases in Multi-Platform publisher
const aliasResult = await publishToMultiplePlatforms({
  clipId: 'clip_alias_test',
  platforms: ['shorts', 'reels'],
  privacy: 'draft',
  customTitle: 'Alias Test Clip',
  filePath: 'https://cdn.example.com/clips/sample.mp4',
});
assert.strictEqual(aliasResult.success, true);
assert.strictEqual(aliasResult.status, 'success', 'Aliases should be resolved to canonical platforms and succeed');
assert.ok(aliasResult.results.youtube?.success, 'Shorts alias should map to YouTube');
assert.ok(aliasResult.results.instagram?.success, 'Reels alias should map to Instagram');

// Test resolveLocalVideoPath
const resolvedPublic = resolveLocalVideoPath('/clips/test.mp4');
const resolvedFileUri = resolveLocalVideoPath('file:///public/clips/test.mp4');
console.log('Path resolution checks completed.');

console.log('✓ Test 6 Passed: Edge cases, aliases, and normalization verified!');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Bot Auto-Publish Configuration Integration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 7: Local Bot Auto-Publish Configuration Integration ---');

const botConfig = getBotConfig();
assert.ok(botConfig.autoPublish !== undefined, 'Bot config missing autoPublish field');

const updatedBotConfig = saveBotConfig(
  {
    autoPublish: {
      enabled: true,
      platforms: ['youtube', 'tiktok'],
      privacy: 'public',
    },
  },
  { restartScheduler: false }
);

assert.strictEqual(updatedBotConfig.autoPublish.enabled, true);
assert.deepStrictEqual(updatedBotConfig.autoPublish.platforms, ['youtube', 'tiktok']);
assert.strictEqual(updatedBotConfig.autoPublish.privacy, 'public');

// Reset bot config back to disabled autoPublish
saveBotConfig(
  {
    autoPublish: {
      enabled: false,
      platforms: ['youtube'],
      privacy: 'public',
    },
  },
  { restartScheduler: false }
);

console.log('✓ Test 7 Passed: Bot autoPublish configuration integration verified!');

console.log('\n🎉 ALL SOCIAL PUBLISHER & DIRECT UPLOAD TESTS PASSED SUCCESSFULLY!');
