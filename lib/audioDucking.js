import path from 'path';
import fs from 'fs';
import { BGM_TRACKS, SFX_SOUNDS, ensureAudioAssets } from './audioAssets.js';
import { ensureBrollAssets } from './broll.js';

// Ducking presets
export const DUCKING_PRESETS = {
  light: {
    threshold: 0.12,
    ratio: 3.0,
    attack: 30,
    release: 350,
    dropPercent: '35%',
  },
  medium: {
    threshold: 0.08,
    ratio: 5.5,
    attack: 25,
    release: 400,
    dropPercent: '65%',
  },
  heavy: {
    threshold: 0.04,
    ratio: 9.0,
    attack: 20,
    release: 500,
    dropPercent: '85%',
  },
};

/**
 * Builds the complex filter and input list for FFmpeg multi-stream composition
 * (Video + B-Roll + Subtitles + Main Audio + Ducked BGM + SFX)
 */
export function buildRenderComplexFilter({
  rawVideoPath,
  relativeAssPath,
  videoWidth = 1080,
  videoHeight = 1920,
  duration = 10,
  audioSettings = {},
  brollSettings = {},
  segments = [],
}) {
  // Ensure default assets exist
  ensureAudioAssets();
  ensureBrollAssets();

  const inputs = [rawVideoPath]; // Input 0: Main video
  const filterGraph = [];
  
  // ───────────────────────────────────────────────────────────────────────────
  // 1. VIDEO PIPELINE (Main Video -> B-Roll Overlays -> ASS Subtitles)
  // ───────────────────────────────────────────────────────────────────────────
  let currentVideoNode = '0:v';

  const brollEnabled = brollSettings.enabled !== false;
  const rawOverlays = Array.isArray(brollSettings.overlays) ? brollSettings.overlays : [];

  if (brollEnabled && rawOverlays.length > 0) {
    for (let i = 0; i < rawOverlays.length; i++) {
      const overlay = rawOverlays[i];
      let assetFile = path.join(process.cwd(), 'public', (overlay.assetPath || '').replace(/^\//, ''));

      // Fallback if PNG/SVG variation
      if (!fs.existsSync(assetFile) && assetFile.endsWith('.png')) {
        const svgAlt = assetFile.replace(/\.png$/, '.svg');
        if (fs.existsSync(svgAlt)) assetFile = svgAlt;
      }

      if (fs.existsSync(assetFile)) {
        inputs.push(assetFile);
        const inputIdx = inputs.length - 1;
        const fadedNode = `broll_fade_${i}`;
        const outputNode = `v_stage_${i}`;

        const oStart = Math.max(0, Number(overlay.start) || 0);
        const oEnd = Math.max(oStart + 0.5, Number(overlay.end) || (oStart + 2.5));
        const fadeDur = Math.min(0.35, Math.max(0.1, (oEnd - oStart) / 4));

        // Loop static image continuously with real-time timestamps, scale, crop, add alpha fade-in and fade-out
        filterGraph.push(
          `[${inputIdx}:v]loop=loop=-1:size=1:start=0,fps=fps=25,scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight},format=yuva420p,fade=t=in:st=${oStart}:d=${fadeDur}:alpha=1,fade=t=out:st=${(oEnd - fadeDur).toFixed(2)}:d=${fadeDur}:alpha=1[${fadedNode}]`
        );

        // Overlay onto the video sequence with precise time bounds
        filterGraph.push(
          `[${currentVideoNode}][${fadedNode}]overlay=0:0:enable='between(t,${oStart},${oEnd})'[${outputNode}]`
        );

        currentVideoNode = outputNode;
      }
    }
  }

  // Final video burn with ASS Subtitle (escape colons and normalize path for Windows/Linux FFmpeg compatibility)
  const finalVideoNode = 'vout';
  if (relativeAssPath) {
    const escapedAssPath = relativeAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filterGraph.push(
      `[${currentVideoNode}]subtitles=${escapedAssPath}[${finalVideoNode}]`
    );
  } else {
    filterGraph.push(
      `[${currentVideoNode}]null[${finalVideoNode}]`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. AUDIO PIPELINE (Main Audio + Ducked BGM + Delayed SFX)
  // ───────────────────────────────────────────────────────────────────────────
  const audioStreamsToMix = [];
  const mainVocalNode = 'main_a';

  // BGM Setup
  const bgmTrackId = audioSettings.bgmTrack || 'none';
  const bgmTrack = BGM_TRACKS.find((b) => b.id === bgmTrackId && b.id !== 'none');
  const bgmVolume = typeof audioSettings.bgmVolume === 'number' ? audioSettings.bgmVolume : 0.3;
  const duckingEnabled = audioSettings.duckingEnabled !== false;
  const duckStrength = audioSettings.duckingStrength || 'medium';
  const duckPreset = DUCKING_PRESETS[duckStrength] || DUCKING_PRESETS.medium;

  const hasBgm = Boolean(bgmTrack && bgmVolume > 0);
  let bgmInputIdx = -1;

  if (hasBgm) {
    const bgmFile = path.join(process.cwd(), 'public', bgmTrack.path.replace(/^\//, ''));
    if (fs.existsSync(bgmFile)) {
      inputs.push(bgmFile);
      bgmInputIdx = inputs.length - 1;
    }
  }

  const willDuck = Boolean(bgmInputIdx >= 0 && duckingEnabled);

  // Normalize main vocal audio to stereo (split into 2 streams if sidechain ducking is needed)
  if (willDuck) {
    filterGraph.push(`[0:a]aformat=channel_layouts=stereo:sample_rates=44100,asplit=2[${mainVocalNode}][main_sc]`);
    audioStreamsToMix.push(`[${mainVocalNode}]`);
  } else {
    filterGraph.push(`[0:a]aformat=channel_layouts=stereo:sample_rates=44100[${mainVocalNode}]`);
    audioStreamsToMix.push(`[${mainVocalNode}]`);
  }

  if (bgmInputIdx >= 0) {
    const volNode = 'bgm_vol';
    const duckedNode = 'ducked_bgm';
    // 2,205,000 samples = ~50s at 44.1kHz stereo buffer (~8.8MB RAM, safe from OOM)
    const bgmLoopSize = 2205000;

    // 1. Loop BGM, convert to stereo & apply master volume
    filterGraph.push(
      `[${bgmInputIdx}:a]aformat=channel_layouts=stereo:sample_rates=44100,aloop=loop=-1:size=${bgmLoopSize},volume=${bgmVolume.toFixed(2)}[${volNode}]`
    );

    // 2. Duck BGM against main vocal audio sidechain if ducking enabled
    if (duckingEnabled) {
      filterGraph.push(
        `[${volNode}][main_sc]sidechaincompress=threshold=${duckPreset.threshold}:ratio=${duckPreset.ratio}:attack=${duckPreset.attack}:release=${duckPreset.release}:makeup=1[${duckedNode}]`
      );
      audioStreamsToMix.push(`[${duckedNode}]`);
    } else {
      audioStreamsToMix.push(`[${volNode}]`);
    }
  }

  // SFX Setup
  const sfxEnabled = audioSettings.sfxEnabled !== false;
  const sfxVolume = typeof audioSettings.sfxVolume === 'number' ? audioSettings.sfxVolume : 0.7;

  if (sfxEnabled && sfxVolume > 0) {
    // Determine SFX trigger timestamps
    const sfxTriggers = [];

    // Trigger 1: Hook / Intro impact at t=0 or first speech start
    const firstSeg = segments[0];
    const hookStart = firstSeg && typeof firstSeg.start === 'number' ? firstSeg.start : 0;
    sfxTriggers.push({
      sfxId: 'impact',
      time: Math.max(0, hookStart),
    });

    // Trigger 2: Punchy pop/ding at subtitle hook or key segment transitions
    if (segments.length > 1) {
      for (let sIdx = 1; sIdx < Math.min(segments.length, 5); sIdx++) {
        const seg = segments[sIdx];
        if (seg && typeof seg.start === 'number' && seg.start > hookStart + 2.5) {
          const sfxChoice = sIdx % 2 === 1 ? 'pop' : 'ding';
          sfxTriggers.push({
            sfxId: sfxChoice,
            time: Number(seg.start.toFixed(2)),
          });
        }
      }
    }

    // Add SFX inputs & delay filters
    let sfxCount = 0;
    for (const trigger of sfxTriggers) {
      const sfxDef = SFX_SOUNDS.find((s) => s.id === trigger.sfxId) || SFX_SOUNDS[0];
      const sfxFile = path.join(process.cwd(), 'public', sfxDef.path.replace(/^\//, ''));

      if (fs.existsSync(sfxFile)) {
        inputs.push(sfxFile);
        const sfxInputIdx = inputs.length - 1;
        const delayMs = Math.round(trigger.time * 1000);
        const sfxOutNode = `sfx_${sfxCount}`;

        filterGraph.push(
          `[${sfxInputIdx}:a]aformat=channel_layouts=stereo:sample_rates=44100,volume=${sfxVolume.toFixed(2)},adelay=${delayMs}|${delayMs}[${sfxOutNode}]`
        );
        audioStreamsToMix.push(`[${sfxOutNode}]`);
        sfxCount++;
      }
    }
  }

  // 3. Final Audio Mix
  const finalAudioNode = 'aout';
  if (audioStreamsToMix.length > 1) {
    const streamRefs = audioStreamsToMix.map((s) => (s.startsWith('[') ? s : `[${s}]`)).join('');
    filterGraph.push(
      `${streamRefs}amix=inputs=${audioStreamsToMix.length}:duration=first:dropout_transition=0,aformat=channel_layouts=stereo:sample_rates=44100[${finalAudioNode}]`
    );
  } else {
    filterGraph.push(`[${mainVocalNode}]anull[${finalAudioNode}]`);
  }

  return {
    inputs,
    filterComplex: filterGraph.join('; '),
    outputMap: ['-map [vout]', '-map [aout]'],
  };
}
