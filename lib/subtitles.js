import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export function getVideoDimensions(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        resolve({ width: 1080, height: 1920 });
      } else {
        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        if (videoStream && videoStream.width && videoStream.height) {
          resolve({ width: videoStream.width, height: videoStream.height });
        } else {
          resolve({ width: 1080, height: 1920 });
        }
      }
    });
  });
}

function formatAssTime(seconds) {
  const totalCs = Math.max(0, Math.floor(seconds * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);

  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs, 2)}`;
}

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

function getAnimatedText(text, animation) {
  const cleanText = text.trim();
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
  const primaryColor = hexToAssColor(style?.color || '#FFFF00', '00');

  // Subtle soft shadow (&H80000000 = 50% transparent black)
  const outlineWidth = style?.outline ? Math.max(2, Math.round(fontSize * 0.07)) : 0;
  const shadowDepth = style?.shadow ? Math.max(1, Math.round(fontSize * 0.04)) : 0;
  const shadowColor = style?.shadow ? '&H80000000' : '&H00000000';

  // Bottom and side margins matching editor preview
  const marginV = Math.round(videoHeight * 0.12);
  const marginLR = Math.round(videoWidth * 0.06);

  const fontName = style?.font || 'Impact';
  const isBold = fontName.toLowerCase() !== 'impact' ? 1 : 0;

  const dialogueLines = (segments || [])
    .map((seg) => {
      const start = formatAssTime(seg.start);
      const end = formatAssTime(seg.end);
      const animText = getAnimatedText(seg.text, style?.animation || 'Pop');
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
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,&H00000000,${shadowColor},${isBold},0,0,0,100,100,0,0,1,${outlineWidth},${shadowDepth},2,${marginLR},${marginLR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueLines}
`;

  fs.writeFileSync(assPath, assContent, 'utf-8');
}
