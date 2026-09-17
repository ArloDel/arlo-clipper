import { NextResponse } from 'next/server';
import { getAllClips } from '@/lib/db';
import { publishToMultiplePlatforms, getSocialConfig } from '@/lib/socialPublishers';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      clipId,
      clip,
      videoPath,
      videoUrl,
      platforms = ['youtube'],
      privacy = 'public',
      scheduleTime = null,
      customTitle = null,
      customCaption = null,
      customHashtags = null,
    } = body;

    let targetClip = clip || null;

    if (!targetClip && clipId) {
      const allClips = getAllClips();
      targetClip = allClips.find((c) => c.id === clipId) || null;
    }

    if (!targetClip && !videoPath && !videoUrl) {
      return NextResponse.json(
        { error: 'Clip data, video path, or clipId is required to publish.' },
        { status: 400 }
      );
    }

    const targetPlatforms = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : ['youtube'];

    const result = await publishToMultiplePlatforms({
      clipId: clipId || targetClip?.id || null,
      clip: targetClip,
      filePath: videoPath || targetClip?.videoPath || null,
      videoUrl: videoUrl || targetClip?.videoUrl || null,
      platforms: targetPlatforms,
      privacy,
      scheduleTime,
      customTitle,
      customCaption,
      customHashtags,
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      results: result.results,
      errors: result.errors,
      history: result.historyRecord,
    });
  } catch (error) {
    console.error('[API /api/publish] Publish failed:', error);
    return NextResponse.json(
      { error: 'Publish execution failed', details: error.message },
      { status: 500 }
    );
  }
}
