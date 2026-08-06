import { NextResponse } from 'next/server';
import { getPaginatedClips, getDb } from '../../../lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '9', 10);
    
    return NextResponse.json(getPaginatedClips(page, limit));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read clips' }, { status: 500 });
  }
}
