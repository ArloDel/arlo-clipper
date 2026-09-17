import { NextResponse } from 'next/server';
import { getPaginatedClips } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '9', 10);
    const filter = searchParams.get('filter') || 'all';
    
    return NextResponse.json(getPaginatedClips(page, limit, filter));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read clips', details: err.message }, { status: 500 });
  }
}

