import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dispatchWebhookEvent, getWebhookSecret } from '@/lib/webhooks';

export async function POST(request) {
  try {
    const { callbackUrl, secret, event = 'clip.completed' } = await request.json();

    if (!callbackUrl) {
      return NextResponse.json(
        { error: 'Missing callbackUrl to test' },
        { status: 400 }
      );
    }

    const testSecret = secret || getWebhookSecret();
    const testClipId = crypto.randomUUID();

    const sampleClip = {
      id: testClipId,
      clipId: testClipId,
      title: 'Cara Mengotomatiskan Konten Video Viral dengan Webhook',
      hook: 'Rahasia Otomatisasi Video 100% Autopilot!',
      caption: 'Ini dia cara membuat konten video shorts dan reels secara otomatis dengan Arlo Clipper & n8n / Make.',
      channelName: 'Arlo Clipper Test Bot',
      duration: 32.5,
      startTime: '00:00:10',
      endTime: '00:00:42',
      videoUrl: `/clips/${testClipId}-final.mp4`,
      hashtags: ['#Shorts', '#Automation', '#AI', '#Viral', '#Webhook'],
    };

    const testPayload = {
      jobId: `test-job-${Date.now()}`,
      status: 'completed',
      totalDurationMs: 1250,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ratio: '9:16',
      channelName: sampleClip.channelName,
      videoTitle: 'Sample Webhook Automation Video',
      clipId: sampleClip.clipId,
      videoUrl: sampleClip.videoUrl,
      title: sampleClip.title,
      hook: sampleClip.hook,
      caption: sampleClip.caption,
      duration: sampleClip.duration,
      startTime: sampleClip.startTime,
      endTime: sampleClip.endTime,
      hashtags: sampleClip.hashtags,
      clips: [sampleClip],
    };

    const deliveryResult = await dispatchWebhookEvent({
      callbackUrl,
      secret: testSecret,
      event,
      data: testPayload,
      retries: 2,
      retryDelayMs: 500,
    });

    return NextResponse.json({
      success: deliveryResult.success,
      deliveryId: deliveryResult.deliveryId,
      statusCode: deliveryResult.statusCode,
      attempts: deliveryResult.attempts,
      error: deliveryResult.error || null,
      message: deliveryResult.success
        ? `Successfully delivered test event '${event}' to ${callbackUrl}`
        : `Failed to deliver test event: ${deliveryResult.error}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Test webhook dispatch failed', details: error.message },
      { status: 500 }
    );
  }
}
