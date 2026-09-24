/**
 * @fileoverview B-Roll Visual Generation and PNG/SVG Synthesis Engine for Arlo Clipper.
 * Generates standalone binary PNG and SVG cards natively without external image dependencies,
 * providing zero-dependency royalty-free visuals for vertical video composition.
 * @module lib/broll
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export { BROLL_THEMES, detectAutoBroll } from './brollCatalog.js';
import { BROLL_THEMES } from './brollCatalog.js';

// CRC-32 Lookup Table for PNG Chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

/**
 * Calculates CRC-32 checksum for PNG chunk data.
 * @private
 */
function crc32(buf, offset = 0, length = buf.length - offset) {
  let crc = 0xffffffff;
  for (let i = offset; i < offset + length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Writes standard 4-part PNG chunk (Length + Type + Data + CRC).
 * @private
 */
function writePngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const chunkCrc = crc32(chunk, 4, 4 + len);
  chunk.writeUInt32BE(chunkCrc, 8 + len);
  return chunk;
}

/**
 * Encodes raw RGBA buffer into a valid standard PNG file buffer.
 *
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {Buffer} rgbaBuffer - Raw 8-bit RGBA pixel buffer (size: width * height * 4)
 * @returns {Buffer} Valid PNG file binary Buffer
 */
export function encodeRgbaToPng(width, height, rgbaBuffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 1. IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit per channel
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // Compression: Deflate
  ihdrData.writeUInt8(0, 11); // Filter method 0
  ihdrData.writeUInt8(0, 12); // No interlace
  const ihdrChunk = writePngChunk('IHDR', ihdrData);

  // 2. IDAT (Scanlines with filter byte 0)
  const rowLen = width * 4;
  const rawScanlines = Buffer.alloc(height * (1 + rowLen));
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (1 + rowLen);
    rawScanlines[rawOffset] = 0; // Filter 0 (None)
    rgbaBuffer.copy(rawScanlines, rawOffset + 1, y * rowLen, (y + 1) * rowLen);
  }

  const compressedData = zlib.deflateSync(rawScanlines, { level: 6 });
  const idatChunk = writePngChunk('IDAT', compressedData);

  // 3. IEND
  const iendChunk = writePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Sets RGBA pixel value with alpha blending.
 * @private
 */
function setPixel(rgba, width, height, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  if (a >= 255) {
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = 255;
  } else {
    const alpha = a / 255;
    const inv = 1 - alpha;
    rgba[idx] = Math.round(r * alpha + rgba[idx] * inv);
    rgba[idx + 1] = Math.round(g * alpha + rgba[idx + 1] * inv);
    rgba[idx + 2] = Math.round(b * alpha + rgba[idx + 2] * inv);
    rgba[idx + 3] = Math.min(255, Math.round(a + rgba[idx + 3] * inv));
  }
}

/**
 * Fills vertical gradient in RGBA buffer.
 * @private
 */
function fillGradient(rgba, width, height, topRgb, bottomRgb) {
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const r = Math.round(topRgb[0] + (bottomRgb[0] - topRgb[0]) * t);
    const g = Math.round(topRgb[1] + (bottomRgb[1] - topRgb[1]) * t);
    const b = Math.round(topRgb[2] + (bottomRgb[2] - topRgb[2]) * t);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
}

/**
 * Fills a solid circle into RGBA buffer.
 * @private
 */
function fillCircle(rgba, width, height, cx, cy, radius, [r, g, b, a = 255]) {
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        setPixel(rgba, width, height, x, y, r, g, b, a);
      }
    }
  }
}

/**
 * Strokes a circle outline in RGBA buffer.
 * @private
 */
function strokeCircle(rgba, width, height, cx, cy, radius, strokeWidth, [r, g, b, a = 255]) {
  const rInner2 = (radius - strokeWidth) * (radius - strokeWidth);
  const rOuter2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rOuter2 && d2 >= rInner2) {
        setPixel(rgba, width, height, x, y, r, g, b, a);
      }
    }
  }
}

/**
 * Fills a rounded rectangle in RGBA buffer.
 * @private
 */
function fillRoundedRect(rgba, width, height, x1, y1, x2, y2, radius, [r, g, b, a = 255]) {
  const minX = Math.max(0, Math.floor(x1));
  const maxX = Math.min(width - 1, Math.ceil(x2));
  const minY = Math.max(0, Math.floor(y1));
  const maxY = Math.min(height - 1, Math.ceil(y2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const inLeft = x < x1 + radius;
      const inRight = x > x2 - radius;
      const inTop = y < y1 + radius;
      const inBottom = y > y2 - radius;

      let inside = true;
      if (inLeft && inTop) {
        const dx = x - (x1 + radius);
        const dy = y - (y1 + radius);
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (inRight && inTop) {
        const dx = x - (x2 - radius);
        const dy = y - (y1 + radius);
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (inLeft && inBottom) {
        const dx = x - (x1 + radius);
        const dy = y - (y2 - radius);
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (inRight && inBottom) {
        const dx = x - (x2 - radius);
        const dy = y - (y2 - radius);
        inside = dx * dx + dy * dy <= radius * radius;
      }

      if (inside) {
        setPixel(rgba, width, height, x, y, r, g, b, a);
      }
    }
  }
}

/**
 * Strokes a rounded rectangle border in RGBA buffer.
 * @private
 */
function strokeRoundedRect(rgba, width, height, x1, y1, x2, y2, radius, strokeWidth, [r, g, b, a = 255]) {
  const minX = Math.max(0, Math.floor(x1));
  const maxX = Math.min(width - 1, Math.ceil(x2));
  const minY = Math.max(0, Math.floor(y1));
  const maxY = Math.min(height - 1, Math.ceil(y2));

  const innerX1 = x1 + strokeWidth;
  const innerY1 = y1 + strokeWidth;
  const innerX2 = x2 - strokeWidth;
  const innerY2 = y2 - strokeWidth;
  const innerRadius = Math.max(1, radius - strokeWidth);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const inLeft = x < x1 + radius;
      const inRight = x > x2 - radius;
      const inTop = y < y1 + radius;
      const inBottom = y > y2 - radius;
      let outer = true;
      if (inLeft && inTop) {
        const dx = x - (x1 + radius);
        const dy = y - (y1 + radius);
        outer = dx * dx + dy * dy <= radius * radius;
      } else if (inRight && inTop) {
        const dx = x - (x2 - radius);
        const dy = y - (y1 + radius);
        outer = dx * dx + dy * dy <= radius * radius;
      } else if (inLeft && inBottom) {
        const dx = x - (x1 + radius);
        const dy = y - (y2 - radius);
        outer = dx * dx + dy * dy <= radius * radius;
      } else if (inRight && inBottom) {
        const dx = x - (x2 - radius);
        const dy = y - (y2 - radius);
        outer = dx * dx + dy * dy <= radius * radius;
      }

      let inner = false;
      if (x >= innerX1 && x <= innerX2 && y >= innerY1 && y <= innerY2) {
        const iLeft = x < innerX1 + innerRadius;
        const iRight = x > innerX2 - innerRadius;
        const iTop = y < innerY1 + innerRadius;
        const iBottom = y > innerY2 - innerRadius;
        inner = true;
        if (iLeft && iTop) {
          const dx = x - (innerX1 + innerRadius);
          const dy = y - (innerY1 + innerRadius);
          inner = dx * dx + dy * dy <= innerRadius * innerRadius;
        } else if (iRight && iTop) {
          const dx = x - (innerX2 - innerRadius);
          const dy = y - (innerY1 + innerRadius);
          inner = dx * dx + dy * dy <= innerRadius * innerRadius;
        } else if (iLeft && iBottom) {
          const dx = x - (innerX1 + innerRadius);
          const dy = y - (innerY2 - innerRadius);
          inner = dx * dx + dy * dy <= innerRadius * innerRadius;
        } else if (iRight && iBottom) {
          const dx = x - (innerX2 - innerRadius);
          const dy = y - (innerY2 - innerRadius);
          inner = dx * dx + dy * dy <= innerRadius * innerRadius;
        }
      }

      if (outer && !inner) {
        setPixel(rgba, width, height, x, y, r, g, b, a);
      }
    }
  }
}

/**
 * Generates a high-quality binary PNG buffer for a given B-Roll theme.
 *
 * @param {string} themeId - Theme ID ('finance'|'technology'|'success'|'alert'|'nature'|'celebration')
 * @param {number} [width=1080] - Image width in pixels
 * @param {number} [height=1920] - Image height in pixels
 * @returns {Buffer} Raw PNG file Buffer
 */
export function generateBrollPng(themeId, width = 1080, height = 1920) {
  const rgba = Buffer.alloc(width * height * 4);

  if (themeId === 'finance') {
    fillGradient(rgba, width, height, [6, 78, 59], [2, 44, 34]);
    strokeCircle(rgba, width, height, 540, 760, 320, 6, [16, 185, 129, 90]);
    strokeCircle(rgba, width, height, 540, 760, 240, 3, [52, 211, 153, 120]);
    fillCircle(rgba, width, height, 540, 760, 160, [245, 158, 11, 255]);
    strokeCircle(rgba, width, height, 540, 760, 150, 8, [217, 119, 6, 255]);
    for (let x = 240; x <= 840; x++) {
      const prog = (x - 240) / 600;
      const y = Math.round(1120 - Math.sin(prog * 1.5) * 380);
      fillCircle(rgba, width, height, x, y, 8, [16, 185, 129, 255]);
    }
    fillRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, [6, 78, 59, 180]);
    strokeRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, 4, [16, 185, 129, 255]);
  } else if (themeId === 'technology') {
    fillGradient(rgba, width, height, [15, 23, 42], [2, 6, 23]);
    for (let y = 300; y <= 1300; y += 200) {
      fillRoundedRect(rgba, width, height, 140, y, 940, y + 2, 0, [30, 41, 59, 180]);
    }
    strokeCircle(rgba, width, height, 540, 760, 260, 6, [56, 189, 248, 120]);
    fillCircle(rgba, width, height, 540, 760, 130, [56, 189, 248, 40]);
    fillCircle(rgba, width, height, 540, 760, 50, [59, 130, 246, 255]);
    fillRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, [15, 23, 42, 200]);
    strokeRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, 4, [56, 189, 248, 255]);
  } else if (themeId === 'success') {
    fillGradient(rgba, width, height, [46, 16, 101], [15, 7, 40]);
    for (let d = -120; d <= 120; d += 60) {
      for (let t = 0; t <= 300; t += 4) {
        const x = 540 + Math.round((d * t) / 300);
        const y = 920 + t;
        fillCircle(rgba, width, height, x, y, 6, [244, 63, 94, Math.max(10, 255 - t)]);
      }
    }
    fillCircle(rgba, width, height, 540, 740, 150, [168, 85, 247, 240]);
    strokeCircle(rgba, width, height, 540, 740, 150, 6, [251, 191, 36, 255]);
    fillCircle(rgba, width, height, 540, 740, 35, [56, 189, 248, 255]);
    fillRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, [46, 16, 101, 190]);
    strokeRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, 4, [192, 132, 252, 255]);
  } else if (themeId === 'alert') {
    fillGradient(rgba, width, height, [69, 10, 10], [24, 4, 4]);
    fillCircle(rgba, width, height, 540, 760, 220, [239, 68, 68, 200]);
    strokeCircle(rgba, width, height, 540, 760, 220, 12, [251, 191, 36, 255]);
    fillRoundedRect(rgba, width, height, 524, 640, 556, 800, 12, [255, 255, 255, 255]);
    fillCircle(rgba, width, height, 540, 850, 16, [255, 255, 255, 255]);
    fillRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, [69, 10, 10, 200]);
    strokeRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, 4, [239, 68, 68, 255]);
  } else if (themeId === 'nature') {
    fillGradient(rgba, width, height, [8, 51, 68], [2, 26, 36]);
    fillCircle(rgba, width, height, 540, 680, 140, [245, 158, 11, 220]);
    for (let x = 0; x < width; x++) {
      const peak1 = 1000 - Math.sin((x / width) * Math.PI) * 350;
      for (let y = Math.max(0, Math.floor(peak1)); y < height; y++) {
        setPixel(rgba, width, height, x, y, 14, 116, 144, 230);
      }
    }
    fillRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, [8, 51, 68, 190]);
    strokeRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, 4, [34, 211, 238, 255]);
  } else {
    // celebration
    fillGradient(rgba, width, height, [120, 53, 15], [39, 12, 2]);
    const confettiColors = [
      [244, 63, 94, 255],
      [251, 191, 36, 255],
      [59, 130, 246, 255],
      [16, 185, 129, 255],
      [168, 85, 247, 255],
    ];
    for (let i = 0; i < 60; i++) {
      const cx = (i * 97 + 45) % width;
      const cy = ((i * 137 + 100) % 1100) + 200;
      const color = confettiColors[i % confettiColors.length];
      fillCircle(rgba, width, height, cx, cy, (i % 8) + 6, color);
    }
    fillCircle(rgba, width, height, 540, 760, 160, [251, 191, 36, 240]);
    strokeCircle(rgba, width, height, 540, 760, 160, 8, [255, 255, 255, 255]);
    fillRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, [120, 53, 15, 200]);
    strokeRoundedRect(rgba, width, height, 160, 1220, 920, 1420, 24, 4, [251, 191, 36, 255]);
  }

  return encodeRgbaToPng(width, height, rgba);
}

/**
 * Generates a high-resolution SVG visual card for a B-Roll theme.
 *
 * @param {string} theme - Theme ID
 * @returns {string} SVG XML content
 */
export function generateBrollSvg(theme) {
  const width = 1080;
  const height = 1920;

  const themeGraphics = {
    finance: `
      <defs>
        <linearGradient id="finGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#064e3b" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#022c22" stop-opacity="0.98"/>
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#finGrad)"/>
      <circle cx="540" cy="800" r="320" fill="none" stroke="#10b981" stroke-width="4" stroke-opacity="0.25"/>
      <circle cx="540" cy="800" r="240" fill="none" stroke="#34d399" stroke-width="2" stroke-opacity="0.35" stroke-dasharray="12 12"/>
      <circle cx="540" cy="800" r="160" fill="url(#goldGrad)"/>
      <text x="540" y="860" font-family="Arial, sans-serif" font-weight="900" font-size="180" fill="#ffffff" text-anchor="middle">$</text>
      <path d="M 220 1200 Q 400 1150, 540 1020 T 860 760" fill="none" stroke="#10b981" stroke-width="16" stroke-linecap="round"/>
      <polygon points="850,730 890,750 870,790" fill="#10b981"/>
      <text x="540" y="1320" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="64" fill="#ffffff" text-anchor="middle" letter-spacing="4">FINANCIAL GROWTH</text>
      <text x="540" y="1390" font-family="'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="36" fill="#34d399" text-anchor="middle">+380% REVENUE SURGE</text>
    `,
    technology: `
      <defs>
        <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.98"/>
        </linearGradient>
        <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#3b82f6"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#techGrad)"/>
      <line x1="200" y1="400" x2="880" y2="400" stroke="#1e293b" stroke-width="2"/>
      <line x1="200" y1="600" x2="880" y2="600" stroke="#1e293b" stroke-width="2"/>
      <line x1="200" y1="800" x2="880" y2="800" stroke="#1e293b" stroke-width="2"/>
      <line x1="200" y1="1000" x2="880" y2="1000" stroke="#1e293b" stroke-width="2"/>
      <circle cx="540" cy="800" r="150" fill="url(#cyanGrad)" fill-opacity="0.2" stroke="#38bdf8" stroke-width="6"/>
      <polygon points="540,690 635,745 635,855 540,910 445,855 445,745" fill="none" stroke="#60a5fa" stroke-width="8"/>
      <circle cx="540" cy="800" r="45" fill="#38bdf8"/>
      <text x="540" y="1280" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="64" fill="#ffffff" text-anchor="middle" letter-spacing="4">ARTIFICIAL INTELLIGENCE</text>
      <text x="540" y="1350" font-family="'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="36" fill="#38bdf8" text-anchor="middle">NEXT-GEN NEURAL SYSTEM</text>
    `,
    success: `
      <defs>
        <linearGradient id="succGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2e1065" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#0f0728" stop-opacity="0.98"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#succGrad)"/>
      <line x1="540" y1="950" x2="420" y2="1180" stroke="#f43f5e" stroke-width="12" stroke-linecap="round"/>
      <line x1="540" y1="950" x2="540" y2="1240" stroke="#fbbf24" stroke-width="18" stroke-linecap="round"/>
      <line x1="540" y1="950" x2="660" y2="1180" stroke="#f43f5e" stroke-width="12" stroke-linecap="round"/>
      <polygon points="540,620 620,780 580,780 580,880 500,880 500,780 460,780" fill="#a855f7" stroke="#ffffff" stroke-width="6"/>
      <circle cx="540" cy="730" r="28" fill="#38bdf8"/>
      <text x="540" y="1320" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="64" fill="#ffffff" text-anchor="middle" letter-spacing="4">UNSTOPPABLE MOMENTUM</text>
      <text x="540" y="1390" font-family="'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="36" fill="#c084fc" text-anchor="middle">LEVEL UP YOUR RESULTS</text>
    `,
    alert: `
      <defs>
        <linearGradient id="alertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#450a0a" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#180404" stop-opacity="0.98"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#alertGrad)"/>
      <polygon points="540,600 750,960 330,960" fill="#ef4444" stroke="#fbbf24" stroke-width="16" stroke-linejoin="round"/>
      <rect x="526" y="710" width="28" height="130" rx="14" fill="#ffffff"/>
      <circle cx="540" cy="890" r="16" fill="#ffffff"/>
      <text x="540" y="1280" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="72" fill="#ffffff" text-anchor="middle" letter-spacing="6">ATTENTION !</text>
      <text x="540" y="1350" font-family="'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="38" fill="#f87171" text-anchor="middle">CRITICAL NOTICE</text>
    `,
    nature: `
      <defs>
        <linearGradient id="natGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#083344" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#021a24" stop-opacity="0.98"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#natGrad)"/>
      <circle cx="540" cy="700" r="140" fill="#f59e0b" fill-opacity="0.8"/>
      <polygon points="260,1050 480,680 700,1050" fill="#0e7490" fill-opacity="0.9"/>
      <polygon points="460,1050 680,620 900,1050" fill="#155e75" fill-opacity="0.95"/>
      <text x="540" y="1280" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="64" fill="#ffffff" text-anchor="middle" letter-spacing="4">EXPLORE THE WORLD</text>
      <text x="540" y="1350" font-family="'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="36" fill="#22d3ee" text-anchor="middle">PEACEFUL & BREATHTAKING</text>
    `,
    celebration: `
      <defs>
        <linearGradient id="celGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#78350f" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#270c02" stop-opacity="0.98"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#celGrad)"/>
      <circle cx="340" cy="650" r="18" fill="#f43f5e"/>
      <circle cx="720" cy="620" r="22" fill="#fbbf24"/>
      <circle cx="420" cy="850" r="16" fill="#3b82f6"/>
      <circle cx="680" cy="820" r="20" fill="#10b981"/>
      <rect x="510" y="600" width="30" height="30" fill="#a855f7" transform="rotate(25 525 615)"/>
      <rect x="360" y="780" width="26" height="26" fill="#f59e0b" transform="rotate(45 373 793)"/>
      <polygon points="540,680 575,760 660,765 595,820 615,900 540,855 465,900 485,820 420,765 505,760" fill="#fbbf24" stroke="#ffffff" stroke-width="4"/>
      <text x="540" y="1280" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="68" fill="#ffffff" text-anchor="middle" letter-spacing="4">CONGRATULATIONS !</text>
      <text x="540" y="1350" font-family="'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="36" fill="#fcd34d" text-anchor="middle">EPIC ACHIEVEMENT</text>
    `,
  };

  const body = themeGraphics[theme] || themeGraphics.finance;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${body}
</svg>`;
}

/**
 * Ensures all B-Roll visual assets exist in public/assets/broll/ as valid binary PNG and SVG files.
 * If missing or corrupted, synthesizes them on the fly.
 *
 * @returns {void}
 */
export function ensureBrollAssets() {
  const brollDir = path.join(process.cwd(), 'public', 'assets', 'broll');
  if (!fs.existsSync(brollDir)) {
    fs.mkdirSync(brollDir, { recursive: true });
  }

  for (const theme of BROLL_THEMES) {
    const svgFile = path.join(brollDir, `${theme.id}.svg`);
    const pngFile = path.join(brollDir, `${theme.id}.png`);

    // Ensure valid SVG exists
    if (!fs.existsSync(svgFile)) {
      try {
        const svgContent = generateBrollSvg(theme.id);
        fs.writeFileSync(svgFile, svgContent, 'utf-8');
      } catch (err) {
        console.warn(`[B-Roll Assets] Failed writing ${theme.id}.svg:`, err);
      }
    }

    // Ensure valid binary PNG exists
    let needPng = !fs.existsSync(pngFile);
    if (!needPng) {
      try {
        const existingBuf = fs.readFileSync(pngFile);
        if (existingBuf.length < 8 || existingBuf[0] !== 0x89 || existingBuf[1] !== 0x50) {
          needPng = true;
        }
      } catch {
        needPng = true;
      }
    }

    if (needPng) {
      try {
        const pngBuf = generateBrollPng(theme.id);
        fs.writeFileSync(pngFile, pngBuf);
      } catch (err) {
        console.warn(`[B-Roll Assets] Failed writing ${theme.id}.png:`, err);
      }
    }
  }
}

try {
  ensureBrollAssets();
} catch (e) {
  // Ignored in non-Node environments
}
