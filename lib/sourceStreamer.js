/**
 * @fileoverview Direct HTTP Media Stream Downloader for Arlo Clipper.
 * Streams remote binary video files to disk, handling redirects, Google Drive virus
 * warning confirmation pages, and verifying downloaded file integrity.
 * @module lib/sourceStreamer
 */

import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Downloads a remote media stream or direct download URL to a local destination on disk.
 * Automatically follows HTTP redirects and resolves Google Drive interstitial confirmation screens.
 *
 * @param {string} url - Direct download or streaming HTTP(S) URL
 * @param {string} outputPath - Absolute or relative path where the video should be saved
 * @returns {Promise<string>} Resolves with the outputPath on successful download
 * @throws {Error} If HTTP response is not ok, if an unresolvable HTML page is returned, or if the downloaded file is 0 bytes
 * @example
 * await downloadDirectStream(
 *   'https://drive.google.com/uc?export=download&id=1AbCd...',
 *   '/path/to/public/uploads/downloaded.mp4'
 * );
 */
export async function downloadDirectStream(url, outputPath) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error downloading stream: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    // If server returned an HTML page (e.g. Google Drive virus warning or confirm screen)
    const htmlText = await response.text();
    const confirmMatch = htmlText.match(/href="(\/uc\?export=download[^"]+)"/) || htmlText.match(/action="https:\/\/drive\.google\.com\/uc\?export=download([^"]+)"/);
    if (confirmMatch && confirmMatch[1]) {
      const retryUrl = confirmMatch[1].startsWith('http')
        ? confirmMatch[1]
        : `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, '&')}`;
      return downloadDirectStream(retryUrl, outputPath);
    }
    throw new Error('Server returned HTML page instead of media stream');
  }

  if (!response.body) {
    throw new Error('No response body returned from stream URL');
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const fileStream = fs.createWriteStream(outputPath);
  // @ts-ignore
  await pipeline(response.body, fileStream);

  // Validate downloaded file is not empty
  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    try { fs.unlinkSync(outputPath); } catch {}
    throw new Error('Downloaded stream file is empty (0 bytes)');
  }

  return outputPath;
}
