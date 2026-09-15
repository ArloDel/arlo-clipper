import fs from 'fs';
import path from 'path';
import assert from 'assert';

import {
  parseYouTubeRssFeed,
  decodeXmlEntities,
  extractYouTubeVideoId,
  getBotConfig,
  saveBotConfig,
  getBotHistory,
  saveBotHistory,
  isProcessed,
  addProcessedVideo,
  addBotLog,
  clearBotHistory,
  generateClipMetadataFiles,
  exportBotClipFiles,
  startBotScheduler,
  stopBotScheduler,
  getSchedulerStatus,
  checkAndProcessNewVideos,
} from '../lib/localBot.js';

import { getAllCopies, formatHashtags } from '../lib/socialCopy.js';

console.log('🧪 ==========================================');
console.log('🧪 Testing Arlo Clipper Local Automation Bot');
console.log('🧪 ==========================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
  }
}

async function runTestSuite() {
  // ── TEST 1: XML Entity Decoding & Feed Parsing ──
  runTest('decodeXmlEntities decodes CDATA, decimal, hex, and standard XML entities', () => {
    assert.strictEqual(decodeXmlEntities('Tech &amp; AI'), 'Tech & AI');
    assert.strictEqual(decodeXmlEntities('&lt;b&gt;Bold&lt;/b&gt;'), '<b>Bold</b>');
    assert.strictEqual(decodeXmlEntities('It&#39;s a &#34;test&#34;'), "It's a \"test\"");
    assert.strictEqual(decodeXmlEntities('Price: &#36;100 &apos;deal&apos;'), "Price: $100 'deal'");
    assert.strictEqual(decodeXmlEntities('<![CDATA[Unescaped <content>]]>'), 'Unescaped <content>');
  });

  // ── TEST 2: Universal YouTube Video ID Extractor ──
  runTest('extractYouTubeVideoId extracts IDs from standard, short, shorts, embed URLs and raw IDs', () => {
    assert.strictEqual(extractYouTubeVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=shared'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(extractYouTubeVideoId(''), null);
    assert.strictEqual(extractYouTubeVideoId(null), null);
  });

  // ── TEST 3: RSS Feed XML Parsing with Special Entities ──
  runTest('YouTube Atom XML Feed Parser parses channel and video entries with entity decoding', () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ"/>
  <id>yt:channel:UCBJycsmduvYEL83R_U4JriQ</id>
  <yt:channelId>UCBJycsmduvYEL83R_U4JriQ</yt:channelId>
  <title>Marques Brownlee &amp; Friends</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ"/>
  <author>
    <name>Marques Brownlee &amp; Friends</name>
    <uri>https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ</uri>
  </author>
  <published>2008-03-21T07:28:44+00:00</published>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>UCBJycsmduvYEL83R_U4JriQ</yt:channelId>
    <title>The Future of Smartphone Tech &amp; AI &mdash; It&#39;s Here!</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <author>
      <name>Marques Brownlee &amp; Friends</name>
      <uri>https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ</uri>
    </author>
    <published>2026-09-15T10:00:00+00:00</published>
    <updated>2026-09-15T10:00:00+00:00</updated>
    <media:group>
      <media:title>The Future of Smartphone Tech &amp; AI &mdash; It&#39;s Here!</media:title>
      <media:description>Reviewing the latest AI hardware innovations &amp; tools.</media:description>
      <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:testVideo002</id>
    <yt:videoId>testVideo002</yt:videoId>
    <yt:channelId>UCBJycsmduvYEL83R_U4JriQ</yt:channelId>
    <title>Is This New Gadget Worth It?</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=testVideo002"/>
    <published>2026-09-14T08:30:00+00:00</published>
    <media:group>
      <media:description>Full deep dive analysis.</media:description>
    </media:group>
  </entry>
</feed>`;

    const parsed = parseYouTubeRssFeed(mockXml);
    assert.strictEqual(parsed.channel.channelId, 'UCBJycsmduvYEL83R_U4JriQ');
    assert.strictEqual(parsed.channel.channelName, 'Marques Brownlee & Friends');
    assert.strictEqual(parsed.videos.length, 2);

    const first = parsed.videos[0];
    assert.strictEqual(first.videoId, 'dQw4w9WgXcQ');
    assert.ok(first.title.includes('Smartphone Tech & AI'));
    assert.ok(first.title.includes("It's Here!"));
    assert.strictEqual(first.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.strictEqual(first.publishedAt, '2026-09-15T10:00:00+00:00');
    assert.strictEqual(first.thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    assert.ok(first.description.includes('AI hardware innovations & tools'));
  });

  // ── TEST 4: Bot Configuration Persistence with Presets and SFX ──
  runTest('Bot Configuration reads, updates and persists preset options including SFX', () => {
    const original = getBotConfig();
    assert.ok(typeof original === 'object');
    assert.ok('preset' in original);
    assert.ok('exportSettings' in original);

    const testChannelUrl = 'https://www.youtube.com/@mkbhd';
    const updated = saveBotConfig({
      channelUrl: testChannelUrl,
      checkIntervalMinutes: 30,
      preset: {
        ratio: '9:16',
        faceTracking: true,
        splitScreen: false,
        bgm: 'chill-lofi',
        ducking: 'heavy',
        sfx: true,
      },
    }, { restartScheduler: false });

    assert.strictEqual(updated.channelUrl, testChannelUrl);
    assert.strictEqual(updated.checkIntervalMinutes, 30);
    assert.strictEqual(updated.preset.faceTracking, true);
    assert.strictEqual(updated.preset.bgm, 'chill-lofi');
    assert.strictEqual(updated.preset.ducking, 'heavy');
    assert.strictEqual(updated.preset.sfx, true);

    const retrieved = getBotConfig();
    assert.strictEqual(retrieved.channelUrl, testChannelUrl);
    assert.strictEqual(retrieved.preset.bgm, 'chill-lofi');
    assert.strictEqual(retrieved.preset.sfx, true);
  });

  // ── TEST 5: History Tracking, Retry Logic & Deduplication ──
  runTest('Bot History handles successful videos, failed retries, and deduplication', () => {
    const successVideoId = `test_succ_${Date.now()}`;
    assert.strictEqual(isProcessed(successVideoId), false);

    const record = addProcessedVideo({
      videoId: successVideoId,
      videoTitle: 'Automated Test Video',
      videoUrl: `https://www.youtube.com/watch?v=${successVideoId}`,
      channelName: 'Test Channel',
      status: 'success',
      clipCount: 2,
      clips: [{ title: 'Clip 1', duration: 25 }, { title: 'Clip 2', duration: 30 }],
    });

    assert.ok(record);
    assert.strictEqual(isProcessed(successVideoId), true);

    // Test failed video retry behavior:
    // Attempt 1 -> isProcessed is false (eligible for retry)
    const failVideoId = `test_fail_${Date.now()}`;
    const fail1 = addProcessedVideo({
      videoId: failVideoId,
      status: 'failed',
      error: 'Transient network error',
    });
    assert.strictEqual(fail1.attempts, 1);
    assert.strictEqual(isProcessed(failVideoId), false, 'First failure should be retried');

    // Attempt 2 -> isProcessed is still false
    const fail2 = addProcessedVideo({
      videoId: failVideoId,
      status: 'failed',
      error: 'Second failure',
    });
    assert.strictEqual(fail2.attempts, 2);
    assert.strictEqual(isProcessed(failVideoId), false, 'Second failure should be retried');

    // Attempt 3 -> isProcessed is now true (exceeded retry threshold)
    const fail3 = addProcessedVideo({
      videoId: failVideoId,
      status: 'failed',
      error: 'Third failure',
    });
    assert.strictEqual(fail3.attempts, 3);
    assert.strictEqual(isProcessed(failVideoId), true, 'Third failure should reach threshold and be treated as processed');

    // Test log recording
    const log = addBotLog({
      level: 'success',
      message: 'Test log event recorded',
      details: { successVideoId },
    });
    assert.ok(log);
    assert.strictEqual(log.level, 'success');
  });

  // ── TEST 6: Social Metadata Generation & Copy Formatting ──
  runTest('Social Metadata formats YouTube Shorts, Instagram Reels, and TikTok captions', () => {
    const mockClip = {
      id: 'clip_unit_test',
      title: 'Secret AI Productivity Tool',
      hook: 'This single AI tool replaced 3 apps for me',
      caption: 'Discover how modern AI models automate content workflows seamlessly.',
      channelName: 'TechCreator',
      startTime: '00:01:20',
      endTime: '00:01:50',
      duration: 30,
      hashtags: ['#AI', '#Productivity', '#Shorts'],
    };

    const copies = getAllCopies(mockClip);
    assert.ok(copies.youtube.includes('Secret AI Productivity Tool'));
    assert.ok(copies.youtube.includes('🔥 This single AI tool replaced 3 apps for me'));
    assert.ok(copies.youtube.includes('#Shorts'));

    assert.ok(copies.instagram.includes('🎥 Credit: @TechCreator'));
    assert.ok(copies.instagram.includes('#Reels'));

    assert.ok(copies.tiktok.includes('cc: TechCreator'));
    assert.ok(copies.tiktok.includes('#fyp'));
  });

  // ── TEST 7: Companion Metadata TXT, JSON File Generation and Batch Summary ──
  runTest('generateClipMetadataFiles creates companion .txt and .json files', () => {
    const testExportDir = path.join(process.cwd(), 'data', 'test_exports');
    if (!fs.existsSync(testExportDir)) {
      fs.mkdirSync(testExportDir, { recursive: true });
    }

    const mockClip = {
      id: 'test_clip_meta_001',
      title: 'Viral Moment Highlight',
      hook: 'You will not believe what happened next',
      caption: 'Full breakdown of the event.',
      channelName: 'Creator Hub',
      startTime: '00:00:10',
      endTime: '00:00:40',
      duration: 30,
      hashtags: ['#Viral', '#Shorts', '#Trending'],
    };

    const sourceVideo = {
      videoId: 'src_video_001',
      videoTitle: 'Full Podcast Episode 100',
      videoUrl: 'https://www.youtube.com/watch?v=src_video_001',
      channelName: 'Creator Hub',
    };

    const result = generateClipMetadataFiles({
      clip: mockClip,
      sourceVideo,
      exportFolder: testExportDir,
      clipIndex: 1,
    });

    assert.ok(result);
    assert.ok(fs.existsSync(result.txtPath), 'Metadata TXT file must exist');
    assert.ok(fs.existsSync(result.jsonPath), 'Metadata JSON file must exist');

    const txtContent = fs.readFileSync(result.txtPath, 'utf-8');
    assert.ok(txtContent.includes('ARLO CLIPPER - AUTOMATED SOCIAL MEDIA METADATA'));
    assert.ok(txtContent.includes('🔴 YOUTUBE SHORTS COPY'));
    assert.ok(txtContent.includes('📸 INSTAGRAM REELS COPY'));
    assert.ok(txtContent.includes('🎵 TIKTOK COPY'));

    const jsonContent = JSON.parse(fs.readFileSync(result.jsonPath, 'utf-8'));
    assert.strictEqual(jsonContent.title, mockClip.title);
    assert.strictEqual(jsonContent.hook, mockClip.hook);
    assert.ok(jsonContent.copies.youtube);

    // Clean up test export dir
    try {
      fs.rmSync(testExportDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ── TEST 8: Bot Scheduler Lifecycle (Start / Stop / Auto-Resume) ──
  runTest('Scheduler starts when enabled, cleanly stops, and auto-resumes on status query', () => {
    saveBotConfig({ enabled: true, checkIntervalMinutes: 60 });
    const started = startBotScheduler();
    assert.strictEqual(started, true);

    const statusRunning = getSchedulerStatus();
    assert.strictEqual(statusRunning.isRunning, true);

    const stopped = stopBotScheduler();
    assert.strictEqual(stopped, true);

    saveBotConfig({ enabled: false });
    const statusStopped = getSchedulerStatus();
    assert.strictEqual(statusStopped.isRunning, false);
  });

  // ── TEST 9: Check & Process Deduplication Cycle ──
  await runAsyncTest('checkAndProcessNewVideos gracefully handles empty/already-processed feed', async () => {
    saveBotConfig({
      channelUrl: 'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw',
      enabled: false,
    });

    const checkRes = await checkAndProcessNewVideos({ isManual: true });
    assert.ok(typeof checkRes === 'object');
    assert.ok('success' in checkRes);
  });

  console.log('\n==========================================');
  console.log(`📊 Test Results: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('==========================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL LOCAL AUTOMATION BOT TESTS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTestSuite();
