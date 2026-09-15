import { NextResponse } from 'next/server';
import { getBotHistory, clearBotHistory } from '@/lib/localBot';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const history = getBotHistory();

    return NextResponse.json({
      success: true,
      processedVideos: history.processedVideos.slice(0, limit),
      totalVideos: history.processedVideos.length,
      logs: history.logs.slice(0, limit),
      totalLogs: history.logs.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const result = clearBotHistory();
    return NextResponse.json({
      success: true,
      message: 'Bot history and logs cleared successfully.',
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
