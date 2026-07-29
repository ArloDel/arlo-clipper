import { NextResponse } from 'next/server';
import { getFolders, createFolder } from '../../../lib/db';

export async function GET() {
  try {
    const folders = getFolders();
    return NextResponse.json(folders);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read folders' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { name } = await request.json();
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    
    const folder = createFolder(name);
    return NextResponse.json(folder);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
