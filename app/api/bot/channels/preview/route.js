import { NextResponse } from 'next/server';
import { resolveChannelInfo } from '../../../../lib/localBot.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const identifier = body.channelIdentifier || body.url || body.channelUrl || body.channelId;

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: 'Please provide a Channel URL, Handle (@name), or Channel ID.' },
        { status: 400 }
      );
    }

    const channelInfo = await resolveChannelInfo(identifier);

    return NextResponse.json({
      success: true,
      channel: {
        channelId: channelInfo.channelId,
        channelName: channelInfo.channelName,
        channelUrl: channelInfo.channelUrl,
        rssUrl: channelInfo.rssUrl,
      },
      videos: channelInfo.videos || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to inspect channel',
      },
      { status: 400 }
    );
  }
}
