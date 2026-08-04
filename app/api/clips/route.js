import { NextResponse } from 'next/server';
import { getAllClips, getDb } from '../../../lib/db';

export async function GET() {
  try {
    return NextResponse.json(getAllClips());
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read clips' }, { status: 500 });
  }
}
