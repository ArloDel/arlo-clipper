import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeFileName, SUPPORTED_VIDEO_EXTENSIONS } from '@/lib/sourceResolver';

// Max upload size: 1GB
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') || formData.get('video') || formData.get('upload');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'No video file provided in form data. Use field "file", "video", or "upload".' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'uploaded_video.mp4';
    const ext = path.extname(originalName).toLowerCase();

    // Validate file extension
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: `Format file tidak didukung (${ext || 'unknown'}). Format yang didukung: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size === 0) {
      return NextResponse.json({ error: 'File video kosong (0 bytes).' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Ukuran file terlalu besar. Maksimum upload adalah 1 GB.' },
        { status: 400 }
      );
    }

    // Ensure upload directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const cleanBaseName = sanitizeFileName(path.basename(originalName, ext));
    const uniqueFileName = `${Date.now()}-${uuidv4().substring(0, 8)}-${cleanBaseName}${ext}`;
    const destinationPath = path.join(uploadsDir, uniqueFileName);

    // Stream / write array buffer to file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(destinationPath, buffer);

    const localFilePath = `/uploads/${uniqueFileName}`;

    console.log(`[Upload] File saved successfully: ${localFilePath} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

    return NextResponse.json({
      success: true,
      localFilePath,
      fileName: originalName,
      fileSize: file.size,
      mimeType: file.type || 'video/mp4',
    });
  } catch (error) {
    console.error('[Upload] Error processing video upload:', error);
    return NextResponse.json(
      { error: 'Gagal mengunggah file video', details: error.message },
      { status: 500 }
    );
  }
}
