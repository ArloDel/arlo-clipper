import { NextResponse } from 'next/server';
import { checkAndProcessNewVideos } from '@/lib/localBot';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    const result = await checkAndProcessNewVideos({
      isManual: true,
      forceVideoUrl: body.url || null,
      localInputPath: body.localInputPath || null,
    });

    return NextResponse.json({
      success: result.success,
      message: result.message || (result.success ? 'Check and processing cycle finished successfully.' : 'Check completed with warnings or errors.'),
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
