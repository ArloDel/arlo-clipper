import { NextResponse } from 'next/server';
import { deleteClip } from '../../../../lib/db';
import fs from 'fs';
import path from 'path';

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Clip ID is required' }, { status: 400 });
    }

    const deletedClip = deleteClip(id);
    
    if (!deletedClip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    // Delete the physical video file if it exists
    if (deletedClip.videoPath) {
      const publicPath = path.join(process.cwd(), 'public');
      // videoPath is usually absolute from root like '/clips/...'
      const filePath = path.join(publicPath, deletedClip.videoPath);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (err) {
    console.error('Delete Clip Error:', err);
    return NextResponse.json({ error: 'Failed to delete clip' }, { status: 500 });
  }
}
