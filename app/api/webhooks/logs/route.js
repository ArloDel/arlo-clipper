import { NextResponse } from 'next/server';
import { getWebhookLogs, clearWebhookLogs, getWebhookSecret } from '@/lib/webhooks';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const logs = getWebhookLogs(limit);
    const secret = getWebhookSecret();

    return NextResponse.json({
      success: true,
      logs,
      secret,
      count: logs.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch webhook logs', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const cleared = clearWebhookLogs();
    return NextResponse.json({ success: cleared, message: 'Webhook logs cleared' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear webhook logs', details: error.message },
      { status: 500 }
    );
  }
}
