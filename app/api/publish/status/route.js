import { NextResponse } from 'next/server';
import { getPublishHistory, getSanitizedSocialConfig } from '@/lib/socialPublishers';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clipId = searchParams.get('clipId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const fullHistory = getPublishHistory(100);
    const filteredHistory = clipId
      ? fullHistory.filter((h) => h.clipId === clipId)
      : fullHistory.slice(0, limit);

    const platformConfig = getSanitizedSocialConfig();

    return NextResponse.json({
      success: true,
      history: filteredHistory,
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
