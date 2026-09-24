/**
 * @fileoverview Subtitle Generator & ASS Styler Engine for Arlo Clipper.
 * Generates Advanced SubStation Alpha (.ass) subtitle files with word-level Karaoke timing,
 * keyframe animation tags (Pop, Slide Up, Blur, Bounce), and resolution-scaled font geometry.
 * @module lib/subtitles
 */

import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Video dimensions result.
 * @typedef {Object} VideoDimensions
 * @property {number} width - Video width in pixels
 * @property {number} height - Video height in pixels
 */

/**
 * Probes video file metadata using FFprobe to get exact width and height in pixels.
 *
 * @param {string} filePath - Path to video file on disk
 * @returns {Promise<VideoDimensions>} Resolves with width and height (defaults to 1080x1920 if probing fails)
 * @example
 * const { width, height } = await getVideoDimensions('/path/to/clip.mp4');
 */
export function getVideoDimensions(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        resolve({ width: 1080, height: 1920 });
      } else {
        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        if (videoStream && videoStream.width && videoStream.height) {
          const rotate = videoStream.tags?.rotate || (videoStream.side_data_list?.find((sd) => sd.rotation)?.rotation);
          if (rotate && (Math.abs(Number(rotate)) === 90 || Math.abs(Number(rotate)) === 270)) {
            resolve({ width: videoStream.height, height: videoStream.width });
          } else {
            resolve({ width: videoStream.width, height: videoStream.height });
          }
        } else {
          resolve({ width: 1080, height: 1920 });
        }
      }
    });
  });
}

/**
 * Formats numeric seconds into standard ASS timestamp (h:mm:ss.cs).
 * @private
 * @param {number|string} seconds - Timestamp in seconds
 * @returns {string} Formatted ASS time string (e.g. "0:01:23.45")
 */
function formatAssTime(seconds) {
  const numSec = typeof seconds === 'number' ? seconds : Number(seconds) || 0;
  const totalCs = Math.max(0, Math.floor(numSec * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);

  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs, 2)}`;
}

/**
 * Converts standard RGB hex color (#RRGGBB) to ASS color format (&HAA BB GG RR&).
 * @private
 * @param {string} hex - Color hex code (e.g. "#FFFF00")
 * @param {string} [alphaHex='00'] - Alpha hex ('00' = fully opaque, '80' = 50% translucent)
 * @returns {string} ASS formatted color code
 */
function hexToAssColor(hex, alphaHex = '00') {
  if (!hex || !hex.startsWith('#')) return `&H${alphaHex}00FFFF&`;
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);
    return `&H${alphaHex}${b}${g}${r}&`;
  }
  return `&H${alphaHex}00FFFF&`;
}

/**
 * Wraps text in ASS override animation tags (Pop, Slide Up, Blur, Bounce).
 * @private
 * @param {string} text - Raw line text
 * @param {string} animation - Animation effect name ('Pop'|'Slide Up'|'Blur'|'Bounce'|'None')
 * @returns {string} ASS tag embellished text
 */
function getAnimatedText(text, animation) {
  const cleanText = text.replace(/[{}]/g, '').trim();
  switch (animation) {
    case 'Pop':
      // Scale from 80% to 110% to 100% with subtle fade in
      return `{\\fad(40,0)\\fscx80\\fscy80\\t(0,100,\\fscx110\\fscy110)\\t(100,180,\\fscx100\\fscy100)}${cleanText}`;
    case 'Slide Up':
      // Vertical slide up with slight fade
      return `{\\fad(70,0)\\fscy75\\t(0,130,\\fscy100)}${cleanText}`;
    case 'Blur':
      // Blur dissolves from blur=6 to blur=0
      return `{\\fad(50,0)\\blur6\\t(0,180,\\blur0)}${cleanText}`;
    case 'Bounce':
      // Elastic bounce scale
      return `{\\fad(30,0)\\fscx60\\fscy60\\t(0,110,\\fscx115\\fscy115)\\t(110,190,\\fscx95\\fscy95)\\t(190,260,\\fscx100\\fscy100)}${cleanText}`;
    case 'None':
    default:
      return cleanText;
  }
}

/**
 * Formats a subtitle segment into ASS word-level Karaoke tags (\\k{centiseconds}).
 *
 * @param {Object} seg - Whisper transcript segment
 * @param {number} [seg.start] - Segment start time in seconds
 * @param {number} [seg.end] - Segment end time in seconds
 * @param {string} [seg.text] - Segment text fallback
 * @param {Array<{word: string, start: number, end: number}>} [seg.words] - Timestamped word list
 * @returns {string} ASS karaoke formatted line (e.g. "{\\k35}Halo {\\k40}semuanya")
 */
export function formatKaraokeAssText(seg) {
  if (!seg) return '';
  const words = Array.isArray(seg.words) && seg.words.length > 0 ? seg.words : null;
  const segStart = typeof seg.start === 'number' ? seg.start : Number(seg.start) || 0;
  const segEnd = typeof seg.end === 'number' ? seg.end : Number(seg.end) || 0;

  if (!words || words.length === 0) {
    const rawTokens = (seg.text || '')
      .replace(/[{}]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (rawTokens.length === 0) return '';
    const segDur = Math.max(0.1, segEnd - segStart);
    const durPerWordCs = Math.max(1, Math.round((segDur / rawTokens.length) * 100));
    return rawTokens.map((t) => `{\\k${durPerWordCs}}${t}`).join(' ');
  }

  let result = '';
  const firstWordStart = typeof words[0].start === 'number' ? words[0].start : Number(words[0].start) || segStart;
  const initialGap = Math.max(0, Math.round((firstWordStart - segStart) * 100));
  if (initialGap > 0) {
    result += `{\\k${initialGap}}`;
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wStart = typeof w.start === 'number' ? w.start : Number(w.start) || segStart;
    const wEnd = typeof w.end === 'number' ? w.end : Number(w.end) || segEnd;

    let nextStart;
    if (words[i + 1]) {
      nextStart = typeof words[i + 1].start === 'number' ? words[i + 1].start : Number(words[i + 1].start);
    } else {
      nextStart = segEnd;
    }

    const effectiveEnd = nextStart != null && !isNaN(nextStart) ? nextStart : wEnd;
    const durCs = Math.max(1, Math.round((effectiveEnd - wStart) * 100));
    const wordText = (w.word || '')
      .replace(/[{}]/g, '')
      .trim();

    result += `{\\k${durCs}}${wordText}${i < words.length - 1 ? ' ' : ''}`;
  }

  return result;
}

/**
 * Subtitle style configuration options.
 * @typedef {Object} SubtitleStyleOptions
 * @property {string} [font='Impact'] - Font family ('Impact'|'Montserrat'|'Roboto'|'Bangers')
 * @property {'small'|'medium'|'large'|string} [size='medium'] - Font size scale
 * @property {string} [color='#FFFF00'] - Primary text color hex
 * @property {boolean} [outline=true] - Whether to render text stroke outline
 * @property {boolean} [shadow=true] - Whether to render drop shadow
 * @property {'Pop'|'Slide Up'|'Blur'|'Bounce'|'Karaoke'|'None'} [animation='Pop'] - Text animation preset
 */

/**
 * Generates and writes an Advanced SubStation Alpha (.ass) subtitle file to disk.
 *
 * @param {Object} params
 * @param {string} params.assPath - Output filesystem path for the .ass file
 * @param {Array<Object>} params.segments - Subtitle segments with timestamps and text
 * @param {SubtitleStyleOptions} [params.style] - Styling and animation preferences
 * @param {number} params.videoWidth - Video canvas width in pixels
 * @param {number} params.videoHeight - Video canvas height in pixels
 * @returns {void}
 * @example
 * generateAssSubtitleFile({
 *   assPath: '/tmp/sub.ass',
 *   segments: [{ start: 0, end: 2.5, text: "Welcome to Arlo Clipper!" }],
 *   style: { font: 'Impact', size: 'medium', color: '#FFFF00', animation: 'Pop' },
 *   videoWidth: 1080,
 *   videoHeight: 1920,
 * });
 */
export function generateAssSubtitleFile({
  assPath,
  segments,
  style,
  videoWidth,
  videoHeight,
}) {
  // Calibrate font size relative to videoHeight (PlayResY)
  const sizeLower = String(style?.size || 'medium').toLowerCase();
  let fontScale = 0.042; // Medium (~45px on 1080h, ~80px on 1920h)
  if (sizeLower === 'small') fontScale = 0.030; // Small (~32px on 1080h, ~58px on 1920h)
  if (sizeLower === 'large') fontScale = 0.055; // Large (~59px on 1080h, ~105px on 1920h)

  const fontSize = Math.round(videoHeight * fontScale);
  const isKaraoke = style?.animation === 'Karaoke';

  let chosenHex = style?.color || '#FFFF00';
  if (isKaraoke && (chosenHex.toLowerCase() === '#ffffff' || chosenHex.toLowerCase() === '#fff')) {
    chosenHex = '#FFFF00';
  }
  const primaryColor = hexToAssColor(chosenHex, '00');
  const secondaryColor = isKaraoke ? '&H00FFFFFF&' : '&H000000FF&';

  // Subtle soft shadow (&H80000000 = 50% transparent black)
  const outlineWidth = style?.outline !== false ? Math.max(2, Math.round(fontSize * 0.08)) : 0;
  const shadowDepth = style?.shadow !== false ? Math.max(1, Math.round(fontSize * 0.04)) : 0;
  const shadowColor = style?.shadow !== false ? '&H80000000' : '&H00000000';

  // Bottom and side margins matching editor preview
  const marginV = Math.round(videoHeight * 0.12);
  const marginLR = Math.round(videoWidth * 0.06);

  const fontName = style?.font || 'Impact';
  const isBold = fontName.toLowerCase() !== 'impact' ? 1 : 0;

  const dialogueLines = (segments || [])
    .map((seg) => {
      const start = formatAssTime(seg.start);
      const end = formatAssTime(seg.end);
      const animText = isKaraoke
        ? formatKaraokeAssText(seg)
        : getAnimatedText(seg.text || '', style?.animation || 'Pop');
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${animText}`;
    })
    .join('\n');

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${secondaryColor},&H00000000,${shadowColor},${isBold},0,0,0,100,100,0,0,1,${outlineWidth},${shadowDepth},2,${marginLR},${marginLR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueLines}
`;

  fs.writeFileSync(assPath, assContent, 'utf-8');
}
