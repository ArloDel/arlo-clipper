import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
// Max logo size: 5 MB
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/watermark/upload
 * Accepts a multipart logo image (png/jpg/jpeg/webp, max 5MB) and stores it in
 * public/watermarks/ for use as an image watermark in renders.
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') || formData.get('logo') || formData.get('image');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'No logo file provided. Use field "file" or "logo".' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'logo.png';
    const ext = path.extname(originalName).toLowerCase();

    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: `Format logo tidak didukung (${ext || 'unknown'}). Gunakan: ${SUPPORTED_IMAGE_EXTENSIONS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'File logo kosong (0 bytes).' }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Ukuran file logo terlalu besar. Maksimum 5 MB.' },
        { status: 400 }
      );
    }

    const watermarksDir = path.join(process.cwd(), 'public', 'watermarks');
    if (!fs.existsSync(watermarksDir)) {
      fs.mkdirSync(watermarksDir, { recursive: true });
    }

    const uniqueFileName = `wm-${Date.now()}-${uuidv4().substring(0, 8)}${ext}`;
    const destinationPath = path.join(watermarksDir, uniqueFileName);

    const arrayBuffer = await file.arrayBuffer();
    await fs.promises.writeFile(destinationPath, Buffer.from(arrayBuffer));

    const imagePath = `/watermarks/${uniqueFileName}`;
    console.log(`[Watermark] Logo saved: ${imagePath} (${(file.size / 1024).toFixed(0)} KB)`);

    return NextResponse.json({ success: true, imagePath, fileName: originalName });
  } catch (error) {
    console.error('[Watermark] Upload error:', error);
    return NextResponse.json(
      { error: 'Gagal mengunggah logo watermark', details: error.message },
      { status: 500 }
    );
  }
}
