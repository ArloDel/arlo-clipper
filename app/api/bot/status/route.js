import { NextResponse } from 'next/server';
import { getBotConfig, saveBotConfig, getSchedulerStatus, startBotScheduler, stopBotScheduler } from '@/lib/localBot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = getBotConfig();
    const status = getSchedulerStatus();
    return NextResponse.json({
      success: true,
      config,
      status: {
        isRunning: status.isRunning,
        isChecking: status.isChecking,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const updated = saveBotConfig(body);

    if (updated.enabled) {
      startBotScheduler();
    } else {
      stopBotScheduler();
    }

    const status = getSchedulerStatus();

    return NextResponse.json({
      success: true,
      message: updated.enabled ? 'Automation bot enabled and scheduler started.' : 'Automation bot paused.',
      config: updated,
      status: {
        isRunning: status.isRunning,
        isChecking: status.isChecking,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
