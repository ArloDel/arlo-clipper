import { NextResponse } from 'next/server';
import {
  getPublishHistory,
  getSanitizedSocialConfig,
  getClipPublishStatus,
  checkDuplicatePublish,
  getClipsPublishMap,
} from '@/lib/socialPublishers';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clipId = searchParams.get('clipId');
    const videoPath = searchParams.get('videoPath');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const targetPlatformsParam = searchParams.get('platforms');
    const targetPlatforms = targetPlatformsParam ? targetPlatformsParam.split(',') : ['youtube', 'tiktok', 'instagram'];

    const fullHistory = getPublishHistory(limit);
    const filteredHistory = clipId
      ? fullHistory.filter((h) => h.clipId === clipId)
      : fullHistory;

    const platformConfig = getSanitizedSocialConfig();
    const lookupKey = clipId || (videoPath ? { videoPath } : null);
    const clipStatus = lookupKey ? getClipPublishStatus(lookupKey, fullHistory) : null;
    const duplicateCheck = lookupKey ? checkDuplicatePublish(lookupKey, targetPlatforms, fullHistory) : null;
    const publishMap = getClipsPublishMap();

    return NextResponse.json({
      success: true,
      history: filteredHistory,
      clipStatus,
      duplicateCheck,
      publishMap,
      platforms: platformConfig,
      count: filteredHistory.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch publish status', details: error.message },
      { status: 500 }
    );
  }
}

