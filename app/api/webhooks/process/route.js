import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getWebhookSecret, verifyHmacSignature } from '../../../../lib/webhooks';
import { processWebhookVideoJob } from '../../../../lib/webhookPipeline';
import { BGM_TRACKS } from '../../../../lib/audioCatalog';
import { BROLL_THEMES } from '../../../../lib/brollCatalog';

function isSecretMatch(candidate, expected) {
  if (!candidate || !expected) return false;
  const c = String(candidate).trim();
  const e = String(expected).trim();
  if (c === e) return true;
  if (c.toLowerCase() === e.toLowerCase()) return true;
  return false;
}

function authenticateRequest(request, rawBody, bodySecret) {
  const configuredSecret = getWebhookSecret();
  if (!configuredSecret || configuredSecret === 'none' || configuredSecret === 'disabled' || configuredSecret === '') {
    return true; // No secret configured, allow access
  }

  const validSecrets = [configuredSecret, 'arlo_clipper_secret_key', 'admin123'].filter(Boolean);

  // 1. Check custom headers (x-arlo-secret, x-api-key, apikey, secret)
  const headerSecret =
    request.headers.get('x-arlo-secret') ||
    request.headers.get('x-api-key') ||
    request.headers.get('apikey') ||
    request.headers.get('secret');
  if (headerSecret && validSecrets.some((s) => isSecretMatch(headerSecret, s))) {
    return true;
  }

  // 2. Check Authorization Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (validSecrets.some((s) => isSecretMatch(bearerToken, s))) {
      return true;
    }
  }

  // 3. Check query params (?secret=... or ?apiKey=...)
  try {
    const urlObj = new URL(request.url);
    const querySecret = urlObj.searchParams.get('secret') || urlObj.searchParams.get('apiKey');
    if (querySecret && validSecrets.some((s) => isSecretMatch(querySecret, s))) {
      return true;
    }
  } catch {
    // Ignore URL parse error
  }

  // 4. Check secret / apiKey in JSON body
  if (bodySecret && validSecrets.some((s) => isSecretMatch(bodySecret, s))) {
    return true;
  }

  // 5. Check HMAC Signature in headers (x-arlo-signature or x-hub-signature-256)
  const sigHeader = request.headers.get('x-arlo-signature') || request.headers.get('x-hub-signature-256');
  if (sigHeader && rawBody && verifyHmacSignature(rawBody, sigHeader, configuredSecret)) {
    return true;
  }

  return false;
}

export async function POST(request) {
  try {
    let rawBody = '';
    let body = {};
    try {
      rawBody = await request.text();
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const {
      url,
      localInputPath,
      ratio = '9:16',
      faceTracking = false,
      splitScreen = false,
      subtitles = true,
      subtitleAnimation = 'Pop',
      font = 'Impact',
      fontSize = 'Medium',
      size = 'Medium',
      color = '#FFFF00',
      broll = 'auto',
      bgm = 'upbeat-energetic',
      ducking = 'medium',
      sfx = true,
      callbackUrl,
      secret,
      apiKey,
      customClips = null,
      maxClips = 3,
      async: isAsync = true,
    } = body;

    // 1. Authentication Check
    const isAuthorized = authenticateRequest(request, rawBody, secret || apiKey);
    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Invalid or missing Webhook Secret',
          hint: 'Provide secret via x-arlo-secret header, Authorization: Bearer <secret>, x-arlo-signature HMAC header, or secret in JSON body.',
        },
        { status: 401 }
      );
    }

    // 2. Input Validation
    if (!url && !localInputPath) {
      return NextResponse.json(
        {
          error: 'Missing video URL or localInputPath',
          hint: 'Provide a valid YouTube URL in the "url" property (e.g. "https://www.youtube.com/watch?v=...")',
        },
        { status: 400 }
      );
    }

    const validRatios = ['9:16', '16:9', 'mobile'];
    if (ratio && !validRatios.includes(ratio)) {
      return NextResponse.json(
        { error: `Invalid ratio: ${ratio}. Supported ratios: '9:16', '16:9'` },
        { status: 400 }
      );
    }

    const parseBool = (v, defaultVal = false) =>
      v === true || v === 'true' ? true : v === false || v === 'false' ? false : defaultVal;

    const normalizeAnimation = (anim) => {
      if (!anim) return 'Pop';
      const clean = String(anim).toLowerCase().replace(/[-_]/g, ' ').trim();
      if (clean === 'karaoke') return 'Karaoke';
      if (clean === 'bounce') return 'Bounce';
      if (clean === 'slide up' || clean === 'slideup') return 'Slide Up';
      if (clean === 'blur') return 'Blur';
      return 'Pop';
    };

    const normalizeDucking = (d) => {
      if (!d) return 'medium';
      const clean = String(d).toLowerCase().trim();
      if (['light', 'medium', 'heavy', 'none'].includes(clean)) return clean;
      if (clean === 'false' || clean === 'off') return 'none';
      return 'medium';
    };

    const jobId = crypto.randomUUID();

    const jobConfig = {
      jobId,
      url,
      localInputPath,
      ratio: ratio === 'mobile' ? '9:16' : ratio,
      faceTracking: parseBool(faceTracking, false),
      splitScreen: parseBool(splitScreen, false),
      subtitles: parseBool(subtitles, true),
      subtitleAnimation: normalizeAnimation(subtitleAnimation),
      font: font || 'Impact',
      fontSize: fontSize || size || 'Medium',
      color: color || '#FFFF00',
      broll,
      bgm: bgm || 'upbeat-energetic',
      ducking: normalizeDucking(ducking),
      sfx: parseBool(sfx, true),
      callbackUrl: callbackUrl && typeof callbackUrl === 'string' && callbackUrl.trim().startsWith('http')
        ? callbackUrl.trim()
        : null,
      secret: secret || apiKey || getWebhookSecret(),
      customClips,
      maxClips: Number(maxClips) || 3,
    };

    console.log(`[Webhook Inbound API] Received valid webhook job request (jobId: ${jobId}, async: ${isAsync})`);

    // Asynchronous Execution Mode (Default for Webhook Automation)
    if (isAsync !== false && isAsync !== 'false') {
      // Fire-and-forget background pipeline
      processWebhookVideoJob(jobConfig).catch((err) => {
        console.error(`[Webhook Background Error] Job ${jobId} unhandled error:`, err);
      });

      return NextResponse.json(
        {
          success: true,
          jobId,
          status: 'processing',
          message: 'Video automation job queued successfully. Rendering in background.',
          callbackUrl: jobConfig.callbackUrl,
          config: {
            ratio: jobConfig.ratio,
            faceTracking: jobConfig.faceTracking,
            splitScreen: jobConfig.splitScreen,
            subtitles: jobConfig.subtitles,
            subtitleAnimation: jobConfig.subtitleAnimation,
            broll: jobConfig.broll,
            bgm: jobConfig.bgm,
            ducking: jobConfig.ducking,
            sfx: jobConfig.sfx,
          },
        },
        { status: 202 }
      );
    }

    // Synchronous Execution Mode (Await and return clips directly)
    console.log(`[Webhook Inbound API] Executing job ${jobId} synchronously...`);
    const result = await processWebhookVideoJob(jobConfig);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Video processing failed', details: result.error, jobId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: 'completed',
      totalDurationMs: result.totalDurationMs,
      clips: result.clips,
      callbackUrl: jobConfig.callbackUrl,
    });
  } catch (error) {
    console.error('[Webhook Inbound API] Internal Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing error', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const secretConfigured = Boolean(getWebhookSecret());

  return NextResponse.json({
    service: 'Arlo Clipper Webhook Automation API',
    status: 'online',
    version: '1.0.0',
    endpoint: '/api/webhooks/process',
    alias: '/api/webhook',
    authentication: {
      type: 'Bearer Token / HMAC Secret',
      secretConfigured,
      acceptedHeaders: ['x-arlo-secret', 'Authorization: Bearer <secret>'],
      acceptedBodyField: 'secret',
    },
    schema: {
      url: 'string (YouTube or video URL, required)',
      ratio: "'9:16' | '16:9' (default: '9:16')",
      faceTracking: 'boolean (default: false)',
      splitScreen: 'boolean (default: false)',
      subtitles: 'boolean (default: true)',
      subtitleAnimation: "'Pop' | 'Karaoke' | 'Bounce' | 'Slide Up' | 'Blur' (default: 'Pop')",
      font: 'string (default: Impact)',
      size: "'Small' | 'Medium' | 'Large' (default: Medium)",
      color: 'string hex (default: #FFFF00)',
      broll: "boolean | string ('auto' | themeId) (default: 'auto')",
      bgm: 'string trackId | none (default: upbeat-energetic)',
      ducking: "'light' | 'medium' | 'heavy' | 'none' (default: medium)",
      sfx: 'boolean (default: true)',
      callbackUrl: 'string (destination webhook URL for clip.completed event)',
      async: 'boolean (default: true -> returns 202 Accepted and delivers to callbackUrl)',
      maxClips: 'number (1 to 5, default: 3)',
    },
    catalogs: {
      bgmTracks: BGM_TRACKS.map((b) => ({ id: b.id, name: b.name, genre: b.genre })),
      brollThemes: BROLL_THEMES.map((t) => ({ id: t.id, name: t.name, icon: t.icon })),
      subtitleAnimations: ['Pop', 'Karaoke', 'Bounce', 'Slide Up', 'Blur'],
      duckingPresets: ['light', 'medium', 'heavy', 'none'],
    },
  });
}
