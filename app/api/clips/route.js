import { NextResponse } from 'next/server';
import { getClipsByFolder, getDb } from '../../../lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    
    if (folderId) {
      return NextResponse.json(getClipsByFolder(folderId));
    }
    
    return NextResponse.json(getDb().clips);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read clips' }, { status: 500 });
  }
}
