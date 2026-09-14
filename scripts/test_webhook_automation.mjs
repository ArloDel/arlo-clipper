import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

import {
  generateHmacSignature,
  verifyHmacSignature,
  getWebhookSecret,
  addWebhookLog,
  getWebhookLogs,
  clearWebhookLogs,
  dispatchWebhookEvent,
} from '../lib/webhooks.js';

import { processWebhookVideoJob } from '../lib/webhookPipeline.js';
import { getAllClips } from '../lib/db.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

console.log('=== ⚡ Starting Webhook Automation Test Suite ===\n');

// Helper to create a local synthetic test video with audio using FFmpeg
async function createSyntheticVideo(filePath, durationSec = 6) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('testsrc=duration=' + durationSec + ':size=1280x720:rate=25')
      .inputFormat('lavfi')
      .input('sine=frequency=440:duration=' + durationSec)
      .inputFormat('lavfi')
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-shortest',
      ])
      .output(filePath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: HMAC Signature Generation and Timing-Safe Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 1: HMAC Signature Generation & Timing-Safe Verification ---');

const testSecret = 'secret_test_key_12345';
const samplePayload = {
  event: 'clip.completed',
  jobId: 'job-987',
  timestamp: '2026-09-14T12:00:00.000Z',
  data: {
    clipId: 'c1',
    title: 'Viral Video Test',
  },
};
const payloadStr = JSON.stringify(samplePayload);

// 1.1 Generate Signature
const signature = generateHmacSignature(payloadStr, testSecret);
assert.ok(signature.startsWith('sha256='), 'Signature must start with sha256= prefix');
assert.strictEqual(signature.length, 7 + 64, 'Signature length must be 71 characters (sha256= + 64 hex)');
console.log(`✓ HMAC Generated: ${signature}`);

// 1.2 Verify Signature (Valid)
const isValid = verifyHmacSignature(payloadStr, signature, testSecret);
assert.strictEqual(isValid, true, 'Valid signature must verify as true');
console.log('✓ Valid signature verification passed');

// 1.3 Verify Signature (Raw Hex format without prefix)
const rawHex = signature.replace('sha256=', '');
const isRawValid = verifyHmacSignature(payloadStr, rawHex, testSecret);
assert.strictEqual(isRawValid, true, 'Raw hex signature without prefix must also verify as true');
console.log('✓ Raw hex signature verification passed');

// 1.4 Tampered payload detection
const tamperedPayload = JSON.stringify({ ...samplePayload, jobId: 'job-hacked' });
const isTamperedValid = verifyHmacSignature(tamperedPayload, signature, testSecret);
assert.strictEqual(isTamperedValid, false, 'Tampered payload must fail verification');
console.log('✓ Tampered payload correctly rejected');

// 1.5 Wrong secret detection
const isWrongSecretValid = verifyHmacSignature(payloadStr, signature, 'wrong_secret_key');
assert.strictEqual(isWrongSecretValid, false, 'Wrong secret must fail verification');
console.log('✓ Wrong secret correctly rejected\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Webhook Activity Logger & Persistence
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 2: Webhook Activity Logs Storage & Retrieval ---');

clearWebhookLogs();
const initialLogs = getWebhookLogs();
assert.strictEqual(initialLogs.length, 0, 'Logs must be empty after clear');

addWebhookLog({
  id: 'log-1',
  type: 'inbound',
  event: 'pipeline.started',
  status: 'processing',
  url: 'https://youtube.com/watch?v=test1',
  callbackUrl: 'https://my-webhook.site/cb',
  durationMs: 150,
});

addWebhookLog({
  id: 'log-2',
  type: 'outbound',
  event: 'clip.completed',
  status: 'success',
  statusCode: 200,
  callbackUrl: 'https://my-webhook.site/cb',
  attempts: 1,
  durationMs: 230,
});

const retrievedLogs = getWebhookLogs();
assert.strictEqual(retrievedLogs.length, 2, 'Must retrieve exactly 2 logged webhook events');
assert.strictEqual(retrievedLogs[0].id, 'log-2', 'Newest log must be first in list');
assert.strictEqual(retrievedLogs[1].id, 'log-1', 'Older log must be second');
console.log(`✓ Webhook activity logging verified: ${retrievedLogs.length} events logged successfully\n`);

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Outbound Webhook Dispatch with Mock Target HTTP Server & Retry Logic
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 3: Outbound Webhook Delivery & Retry Logic ---');

async function testOutboundDelivery() {
  let receivedRequests = [];
  let simulateFailures = 1; // Fail 1st request with 500, succeed on 2nd

  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      receivedRequests.push({
        method: req.method,
        headers: req.headers,
        body: body ? JSON.parse(body) : null,
      });

      if (simulateFailures > 0) {
        simulateFailures--;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Temporary Server Error' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Event Received' }));
      }
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockCallbackUrl = `http://127.0.0.1:${port}/webhook/receiver`;

  console.log(`Mock Webhook Receiver listening on ${mockCallbackUrl}`);

  const dispatchResult = await dispatchWebhookEvent({
    callbackUrl: mockCallbackUrl,
    secret: testSecret,
    event: 'clip.completed',
    data: {
      jobId: 'job-test-retry',
      clips: [
        { id: 'clip-101', title: 'Viral Moment', duration: 15 },
      ],
    },
    retries: 3,
    retryDelayMs: 200,
  });

  mockServer.close();

  assert.strictEqual(dispatchResult.success, true, 'Dispatch must eventually succeed after retry');
  assert.strictEqual(dispatchResult.attempts, 2, 'Must have taken 2 attempts (1 failure + 1 success)');
  assert.strictEqual(receivedRequests.length, 2, 'Mock server must have received 2 requests');

  const secondReq = receivedRequests[1];
  assert.strictEqual(secondReq.headers['x-arlo-event'], 'clip.completed', 'Header x-arlo-event must match');
  assert.ok(secondReq.headers['x-arlo-signature'], 'Header x-arlo-signature must be present');
  assert.ok(secondReq.headers['x-arlo-delivery'], 'Header x-arlo-delivery must be present');

  // Verify HMAC signature on received request
  const receivedRaw = JSON.stringify(secondReq.body);
  const isSigValid = verifyHmacSignature(receivedRaw, secondReq.headers['x-arlo-signature'], testSecret);
  assert.strictEqual(isSigValid, true, 'Signature received by webhook endpoint must be valid');

  console.log(`✓ Outbound delivery verified with retries and valid HMAC signature\n`);
}

await testOutboundDelivery();

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: End-to-End Automated Webhook Video Processing Pipeline
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 4: End-to-End Webhook Pipeline Execution & DB Save ---');

async function testFullPipeline() {
  const syntheticInputPath = path.join(process.cwd(), 'public', 'clips', 'test-webhook-synthetic.mp4');
  console.log('Generating 6-second synthetic test video with audio track...');
  await createSyntheticVideo(syntheticInputPath, 6);
  assert.ok(fs.existsSync(syntheticInputPath), 'Synthetic video file must exist');

  let callbackEventReceived = null;
  const pipelineServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      callbackEventReceived = {
        headers: req.headers,
        payload: JSON.parse(body),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => pipelineServer.listen(0, '127.0.0.1', resolve));
  const port = pipelineServer.address().port;
  const pipelineCallbackUrl = `http://127.0.0.1:${port}/webhook/pipeline-done`;

  const pipelineJobId = `job-test-${Date.now()}`;

  console.log(`Executing processWebhookVideoJob with local synthetic input...`);
  const pipelineResult = await processWebhookVideoJob({
    jobId: pipelineJobId,
    localInputPath: syntheticInputPath,
    ratio: '9:16',
    subtitles: true,
    subtitleAnimation: 'Pop',
    broll: 'finance',
    bgm: 'upbeat-energetic',
    ducking: 'medium',
    sfx: true,
    callbackUrl: pipelineCallbackUrl,
    secret: testSecret,
    customClips: [
      {
        title: 'Bagian Menarik Webhook',
        hook: 'Trik Otomatisasi Video AI!',
        caption: 'Otomatisasi video dengan webhook endpoint n8n dan Make.',
        startTime: '00:00:00',
        endTime: '00:00:04',
        hashtags: ['#Webhook', '#AI', '#Viral'],
      },
    ],
  });

  pipelineServer.close();

  // Cleanup synthetic input
  try {
    if (fs.existsSync(syntheticInputPath)) fs.unlinkSync(syntheticInputPath);
  } catch (e) {
    console.warn('Cleanup warning:', e.message);
  }

  assert.strictEqual(pipelineResult.success, true, 'Pipeline execution must return success: true');
  assert.strictEqual(pipelineResult.status, 'completed', 'Job status must be completed');
  assert.ok(Array.isArray(pipelineResult.clips) && pipelineResult.clips.length > 0, 'Must return array of saved clips');

  const renderedClip = pipelineResult.clips[0];
  console.log(`Rendered Clip ID: ${renderedClip.id}`);
  console.log(`Rendered Clip Video Path: ${renderedClip.videoPath}`);

  // Check that rendered video file exists on disk
  const diskPath = path.join(process.cwd(), 'public', renderedClip.videoPath.replace(/^\//, ''));
  assert.ok(fs.existsSync(diskPath), `Rendered video file ${diskPath} must exist on disk`);

  // Verify saved in DB
  const allClips = getAllClips();
  const foundInDb = allClips.find((c) => c.id === renderedClip.id);
  assert.ok(foundInDb, 'Rendered clip must be saved and discoverable in DB');
  assert.strictEqual(foundInDb.title, 'Bagian Menarik Webhook');
  assert.strictEqual(foundInDb.hook, 'Trik Otomatisasi Video AI!');

  // Verify outbound callback was received with valid event & signature
  assert.ok(callbackEventReceived, 'Mock callback server must have received outbound webhook event');
  assert.strictEqual(callbackEventReceived.payload.event, 'clip.completed');
  assert.strictEqual(callbackEventReceived.payload.jobId, pipelineJobId);
  assert.ok(callbackEventReceived.payload.clipId, 'Payload must have root clipId');
  assert.ok(callbackEventReceived.payload.videoUrl, 'Payload must have root videoUrl');
  assert.strictEqual(callbackEventReceived.payload.title, 'Bagian Menarik Webhook');
  assert.strictEqual(callbackEventReceived.payload.hook, 'Trik Otomatisasi Video AI!');
  assert.strictEqual(callbackEventReceived.payload.clips.length, 1);

  // Cleanup rendered test clip file
  try {
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } catch (e) {
    console.warn('Test clip cleanup warning:', e.message);
  }

  console.log('✓ End-to-end webhook automation pipeline verified successfully\n');
}

await testFullPipeline();

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Subtitle-Disabled (subtitles: false) Pipeline Execution
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 5: Subtitle-Disabled Webhook Pipeline Execution ---');

async function testNoSubtitlePipeline() {
  const syntheticInputPath = path.join(process.cwd(), 'public', 'clips', 'test-webhook-nosub.mp4');
  await createSyntheticVideo(syntheticInputPath, 4);

  const pipelineJobId = `job-test-nosub-${Date.now()}`;
  const res = await processWebhookVideoJob({
    jobId: pipelineJobId,
    localInputPath: syntheticInputPath,
    ratio: '16:9',
    subtitles: false,
    broll: false,
    bgm: 'none',
    ducking: 'none',
    sfx: false,
    customClips: [
      {
        title: 'Clean Video Without Subtitles',
        hook: 'Clean Video Hook',
        startTime: '00:00:00',
        endTime: '00:00:03',
      },
    ],
  });

  try {
    if (fs.existsSync(syntheticInputPath)) fs.unlinkSync(syntheticInputPath);
  } catch (e) {
    // ignore
  }

  assert.strictEqual(res.success, true, 'Pipeline with subtitles: false must succeed');
  assert.ok(res.clips.length > 0, 'Must produce a clip without subtitles');

  const clip = res.clips[0];
  const diskPath = path.join(process.cwd(), 'public', clip.videoPath.replace(/^\//, ''));
  assert.ok(fs.existsSync(diskPath), 'Rendered clip file must exist');

  try {
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } catch (e) {
    // ignore
  }

  console.log('✓ Subtitle-disabled webhook pipeline verified successfully\n');
}

await testNoSubtitlePipeline();

console.log('🎉 ALL WEBHOOK AUTOMATION TESTS PASSED SUCCESSFULLY!');
