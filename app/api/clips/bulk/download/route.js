import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ZipArchive } from 'archiver';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';

export async function POST(request) {
  try {
    const { ids } = await request.json();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const db = getDb();
    const clipsToDownload = db.clips.filter(c => ids.includes(c.id));

    if (clipsToDownload.length === 0) {
      return NextResponse.json({ error: 'No clips found' }, { status: 404 });
    }

    const passThrough = new PassThrough();

    const archive = new ZipArchive({
      zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      throw err;
    });

    archive.pipe(passThrough);

    // Append files
    clipsToDownload.forEach((clip, index) => {
      if (clip.videoPath) {
        const filepath = path.join(process.cwd(), 'public', clip.videoPath.replace(/^\//, ''));
        if (fs.existsSync(filepath)) {
          // Normalize filename, fallback to index if missing title
          const safeTitle = (clip.title || `clip-${index+1}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const ext = path.extname(filepath) || '.mp4';
          archive.file(filepath, { name: `${safeTitle}${ext}` });
        }
      }
    });

    archive.finalize();

    // Convert PassThrough to ReadableStream for Next.js response
    const webStream = new ReadableStream({
      start(controller) {
        passThrough.on('data', (chunk) => controller.enqueue(chunk));
        passThrough.on('end', () => controller.close());
        passThrough.on('error', (err) => controller.error(err));
      }
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="Arlo-Clips.zip"'
      }
    });

  } catch (error) {
    console.error('Error zipping clips:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
