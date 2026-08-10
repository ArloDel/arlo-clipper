import { NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import { saveClip } from '../../../lib/db';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function POST(request) {
  try {
    // We expect an array of clips from the editor, each containing their styling and segments
    const { clips } = await request.json();

    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const clipsDir = path.join(process.cwd(), 'public', 'clips');
    const savedClips = [];

    const formatTime = (secs) => {
      const d = new Date(secs * 1000);
      const h = String(Math.floor(secs / 3600)).padStart(2, '0');
      const m = String(d.getUTCMinutes()).padStart(2, '0');
      const s = String(d.getUTCSeconds()).padStart(2, '0');
      const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
      return `${h}:${m}:${s},${ms}`;
    };

    let index = 1;
    for (const clip of clips) {
      console.log(`[Render Final] Processing clip ${index}/${clips.length}...`);
      
      const rawClipPath = path.join(process.cwd(), 'public', clip.videoPath);
      const srtPath = path.join(clipsDir, `${clip.id}-subtitle.srt`);
      const finalSubtitledPath = path.join(clipsDir, `${clip.id}-final.mp4`);

      // 1. Generate SRT from the potentially edited segments
      const srtContent = clip.segments.map((seg, i) => {
        return `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}\n`;
      }).join('\n');
      
      fs.writeFileSync(srtPath, srtContent);
      
      // 2. Prepare ASS styling
      let fontSize = 24;
      const sizeLower = String(clip.style.size).toLowerCase();
      if (sizeLower === 'small') fontSize = 16;
      else if (sizeLower === 'medium') fontSize = 24;
      else if (sizeLower === 'large') fontSize = 32;
      else fontSize = parseInt(clip.style.size) || 24;

      let assColor = '&H0000FFFF&';
      const color = clip.style.color;
      if (color && color.startsWith('#') && color.length === 7) {
        const r = color.substring(1, 3);
        const g = color.substring(3, 5);
        const b = color.substring(5, 7);
        assColor = `&H00${b}${g}${r}&`;
      }
      
      // Convert outline style to ASS tags. For shadow/stroke we can use Outline and Shadow.
      // Assuming clip.style.outline is boolean or a specific thickness.
      const outlineSize = clip.style.outline ? '2' : '0';
      const shadowSize = clip.style.shadow ? '2' : '0';

      const forceStyle = `FontName=${clip.style.font || 'Impact'},FontSize=${fontSize},PrimaryColour=${assColor},Outline=${outlineSize},Shadow=${shadowSize},Alignment=2,MarginV=60`;
      
      // Note: we use relative path for subtitles filter
      const relativeSrtPath = `public/clips/${clip.id}-subtitle.srt`;

      console.log(`[Render Final] Burning Subtitles for clip ${index}...`);
      await new Promise((resolve, reject) => {
        ffmpeg(rawClipPath)
          .videoFilters(`subtitles=${relativeSrtPath}:force_style='${forceStyle}'`)
          .videoBitrate('8000k')
          .output(finalSubtitledPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const videoSrc = `/clips/${path.basename(finalSubtitledPath)}`;
      
      const savedClip = saveClip({
        title: clip.title || `Clip ${index}`,
        videoPath: videoSrc,
        duration: clip.duration
      });
      
      savedClips.push(savedClip);

      try {
        if (fs.existsSync(rawClipPath)) fs.unlinkSync(rawClipPath);
        if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
      } catch (e) {
        console.warn("Final cleanup warning:", e);
      }

      index++;
    }

    return NextResponse.json({
      success: true,
      clips: savedClips
    });

  } catch (error) {
    console.error('Render Final Error:', error);
    return NextResponse.json({ error: 'Final render failed', details: error.message }, { status: 500 });
  }
}
