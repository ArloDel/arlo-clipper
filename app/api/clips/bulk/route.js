import { NextResponse } from 'next/server';
import { deleteClips } from '../../../../lib/db';
import fs from 'fs';
import path from 'path';

export async function DELETE(request) {
  try {
    const { ids } = await request.json();
    
    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const deletedClips = deleteClips(ids);
    
    if (deletedClips && deletedClips.length > 0) {
      // Clean up files
      deletedClips.forEach(clip => {
        try {
          if (clip.videoPath) {
            const filepath = path.join(process.cwd(), 'public', clip.videoPath);
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }
        } catch (e) {
          console.warn(`Failed to delete file for clip ${clip.id}`, e);
        }
      });
      return NextResponse.json({ success: true, count: deletedClips.length });
    }

    return NextResponse.json({ error: 'Clips not found' }, { status: 404 });
  } catch (error) {
    console.error('Error deleting clips:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
