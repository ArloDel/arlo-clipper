import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  BGM_TRACKS,
  SFX_SOUNDS,
  createWavBuffer,
  synthesizePop,
  synthesizeWhoosh,
  synthesizeSwoosh,
  synthesizeDing,
  synthesizeImpact,
  synthesizeCameraShutter,
  synthesizeUpbeatBGM,
  synthesizeChillLofiBGM,
  synthesizeDramaticSuspenseBGM,
  synthesizeCinematicEpicBGM,
  synthesizePlayfulFunBGM,
  ensureAudioAssets,
} from '../lib/audioAssets.js';
import {
  BROLL_THEMES,
  detectAutoBroll,
  generateBrollSvg,
  generateBrollPng,
  ensureBrollAssets,
} from '../lib/broll.js';
import { buildRenderComplexFilter, DUCKING_PRESETS } from '../lib/audioDucking.js';

console.log('=== 🎵 Starting Auto B-Roll / SFX & BGM Ducking Test Suite ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Audio Asset Catalog & Synthesizers
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 1: Audio Assets Synthesis & WAV Header Validity ---');

// 1.1 Verify Catalog counts
assert.ok(BGM_TRACKS.length >= 6, 'Must have at least 6 BGM tracks (including None)');
assert.ok(SFX_SOUNDS.length >= 6, 'Must have at least 6 SFX sound definitions');
console.log(`✓ Catalog verified: ${BGM_TRACKS.length} BGM tracks, ${SFX_SOUNDS.length} SFX sounds`);

// 1.2 Test RIFF/WAVE header parser helper
function parseWavHeader(buf) {
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF', 'Missing RIFF chunk header');
  assert.strictEqual(buf.toString('ascii', 8, 12), 'WAVE', 'Missing WAVE format');
  assert.strictEqual(buf.toString('ascii', 12, 16), 'fmt ', 'Missing fmt subchunk');
  const audioFormat = buf.readUInt16LE(20);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  assert.strictEqual(buf.toString('ascii', 36, 40), 'data', 'Missing data subchunk');
  const dataSize = buf.readUInt32LE(40);

  return { audioFormat, numChannels, sampleRate, bitsPerSample, dataSize };
}

// 1.3 Synthesize all SFX and test PCM WAV buffer validity
const sfxGenerators = [
  { name: 'pop', fn: synthesizePop, minSec: 0.1, maxSec: 0.2 },
  { name: 'whoosh', fn: synthesizeWhoosh, minSec: 0.3, maxSec: 0.5 },
  { name: 'swoosh', fn: synthesizeSwoosh, minSec: 0.3, maxSec: 0.5 },
  { name: 'ding', fn: synthesizeDing, minSec: 0.7, maxSec: 1.0 },
  { name: 'impact', fn: synthesizeImpact, minSec: 0.6, maxSec: 0.9 },
  { name: 'camera-shutter', fn: synthesizeCameraShutter, minSec: 0.2, maxSec: 0.4 },
];

for (const sfx of sfxGenerators) {
  const samples = sfx.fn(44100);
  assert.ok(samples.length > 0, `${sfx.name} samples must not be empty`);
  const wavBuf = createWavBuffer(samples, 44100, 1);
  const header = parseWavHeader(wavBuf);

  assert.strictEqual(header.audioFormat, 1, `${sfx.name} audioFormat must be 1 (PCM)`);
  assert.strictEqual(header.numChannels, 1, `${sfx.name} numChannels must be 1 (Mono)`);
  assert.strictEqual(header.sampleRate, 44100, `${sfx.name} sampleRate must be 44100Hz`);
  assert.strictEqual(header.bitsPerSample, 16, `${sfx.name} bitsPerSample must be 16-bit`);
  assert.strictEqual(header.dataSize, samples.length * 2, `${sfx.name} dataSize mismatch`);

  const dur = samples.length / 44100;
  assert.ok(
    dur >= sfx.minSec && dur <= sfx.maxSec,
    `${sfx.name} duration ${dur.toFixed(2)}s outside expected range [${sfx.minSec}, ${sfx.maxSec}]`
  );
  console.log(`  ✓ SFX "${sfx.name}" generated: ${dur.toFixed(2)}s, ${wavBuf.length} bytes`);
}

// 1.4 Synthesize BGM Loops
const bgmGenerators = [
  { name: 'upbeat-energetic', fn: synthesizeUpbeatBGM },
  { name: 'chill-lofi', fn: synthesizeChillLofiBGM },
  { name: 'dramatic-suspense', fn: synthesizeDramaticSuspenseBGM },
  { name: 'cinematic-epic', fn: synthesizeCinematicEpicBGM },
  { name: 'playful-fun', fn: synthesizePlayfulFunBGM },
];

for (const bgm of bgmGenerators) {
  const samples = bgm.fn(44100);
  assert.ok(samples.length > 0, `${bgm.name} samples must not be empty`);
  const wavBuf = createWavBuffer(samples, 44100, 1);
  const header = parseWavHeader(wavBuf);

  assert.strictEqual(header.audioFormat, 1, `${bgm.name} PCM format`);
  assert.strictEqual(header.sampleRate, 44100, `${bgm.name} 44100Hz`);
  assert.strictEqual(header.bitsPerSample, 16, `${bgm.name} 16-bit`);
  const dur = samples.length / 44100;
  assert.ok(dur >= 10.0, `${bgm.name} duration should be >= 10s loop`);
  console.log(`  ✓ BGM "${bgm.name}" loop generated: ${dur.toFixed(2)}s, ${(wavBuf.length / 1024).toFixed(1)} KB`);
}

// 1.5 Test ensureAudioAssets writes to disk cleanly
ensureAudioAssets();
const bgmCheck = path.join(process.cwd(), 'public', 'assets', 'audio', 'bgm', 'upbeat-energetic.wav');
const sfxCheck = path.join(process.cwd(), 'public', 'assets', 'audio', 'sfx', 'pop.wav');
assert.ok(fs.existsSync(bgmCheck), 'public/assets/audio/bgm/upbeat-energetic.wav must exist on disk');
assert.ok(fs.existsSync(sfxCheck), 'public/assets/audio/sfx/pop.wav must exist on disk');
console.log('✓ ensureAudioAssets successfully created disk files!\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: B-Roll Themes, SVGs & Smart Keyword Matcher & Binary PNG Validity
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 2: B-Roll Keyword Detection, SVGs & Real Binary PNGs ---');

// 2.1 Verify themes catalog & SVG templates
assert.ok(BROLL_THEMES.length >= 6, 'Must have at least 6 B-Roll themes');
for (const theme of BROLL_THEMES) {
  assert.ok(theme.id && theme.name && theme.icon && theme.keywords.length > 0, `Theme ${theme.id} invalid`);
  const svg = generateBrollSvg(theme.id);
  assert.ok(svg.includes('<svg'), `Theme ${theme.id} SVG missing <svg> tag`);
  assert.ok(svg.includes('viewBox="0 0 1080 1920"'), `Theme ${theme.id} SVG missing 1080x1920 viewBox`);

  // Verify binary PNG generator
  const pngBuf = generateBrollPng(theme.id);
  assert.ok(Buffer.isBuffer(pngBuf), `generateBrollPng(${theme.id}) must return a Buffer`);
  assert.strictEqual(pngBuf[0], 0x89, 'PNG magic byte 0');
  assert.strictEqual(pngBuf[1], 0x50, 'PNG magic byte 1 (P)');
  assert.strictEqual(pngBuf[2], 0x4e, 'PNG magic byte 2 (N)');
  assert.strictEqual(pngBuf[3], 0x47, 'PNG magic byte 3 (G)');
  assert.strictEqual(pngBuf.toString('ascii', 12, 16), 'IHDR', 'Missing IHDR chunk');
}
console.log(`✓ All ${BROLL_THEMES.length} B-Roll themes, SVG templates & binary PNGs verified`);

// 2.2 Ensure B-Roll disk assets
ensureBrollAssets();
const brollCheck = path.join(process.cwd(), 'public', 'assets', 'broll', 'finance.png');
assert.ok(fs.existsSync(brollCheck), 'public/assets/broll/finance.png must exist on disk');
const diskPngBuf = fs.readFileSync(brollCheck);
assert.strictEqual(diskPngBuf[0], 0x89, 'Disk finance.png must be genuine binary PNG, not text');
console.log('✓ ensureBrollAssets successfully initialized valid binary PNG assets on disk');

// 2.3 Smart Keyword Matching tests (Indonesian & English)
const sampleSegments1 = [
  { id: 0, start: 0.0, end: 3.0, text: 'Rahasia bisnis omset naik 500 juta rupiah' },
  { id: 1, start: 3.5, end: 6.5, text: 'Dengan bantuan AI dan software otomatisasi modern' },
  { id: 2, start: 7.0, end: 10.0, text: 'Jangan lakukan kesalahan fatal ini, awas bahaya!' },
  { id: 3, start: 10.5, end: 13.5, text: 'Supaya impian sukses dan target kamu tercapai' },
  { id: 4, start: 14.0, end: 17.0, text: 'Waktunya liburan santai menikmati alam' },
  { id: 5, start: 17.5, end: 20.0, text: 'Wow selamat pesta perayaan yang luar biasa' },
];

const autoOverlays = detectAutoBroll(sampleSegments1, 'Rahasia Cuan');
console.log(`Detected ${autoOverlays.length} B-Roll overlays for sample transcript:`);
for (const ov of autoOverlays) {
  console.log(`  - [${ov.start}s - ${ov.end}s] ${ov.icon} ${ov.themeName} (matched: "${ov.keyword}")`);
}

// Verification assertions
assert.ok(autoOverlays.length >= 4, 'Should detect multiple B-Roll overlays');
assert.strictEqual(autoOverlays[0].theme, 'finance', 'First overlay should match finance');
assert.strictEqual(autoOverlays[1].theme, 'technology', 'Second overlay should match technology (AI/software)');
assert.strictEqual(autoOverlays[2].theme, 'alert', 'Third overlay should match alert (bahaya/kesalahan)');
assert.strictEqual(autoOverlays[3].theme, 'success', 'Fourth overlay should match success (sukses/target)');

// 2.4 Test Theme Override
const forcedOverlays = detectAutoBroll(sampleSegments1, '', 'celebration');
assert.ok(forcedOverlays.length > 0, 'Forced theme should produce overlays');
assert.ok(forcedOverlays.every((o) => o.theme === 'celebration'), 'All overlays should match forced theme');
console.log('✓ B-Roll theme override verified');

// 2.5 Test Fallback when no keywords match
const emptySegs = [{ id: 0, start: 1.0, end: 5.0, text: 'xyz abc lorem ipsum' }];
const fallbackOverlays = detectAutoBroll(emptySegs, '');
assert.strictEqual(fallbackOverlays.length, 1, 'Should create 1 fallback hook overlay');
assert.strictEqual(fallbackOverlays[0].theme, 'finance', 'Fallback should use default theme');
console.log('✓ Fallback B-Roll overlay logic verified\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Audio Ducking & Multi-Stream FFmpeg Filtergraph Generator
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 3: Audio Ducking & Multi-Stream Complex Filter ---');

// 3.1 Verify Ducking Presets
assert.ok(DUCKING_PRESETS.light && DUCKING_PRESETS.medium && DUCKING_PRESETS.heavy);
assert.ok(DUCKING_PRESETS.medium.threshold > 0 && DUCKING_PRESETS.medium.ratio > 1);
console.log('✓ Ducking presets verified (Light, Medium, Heavy)');

// 3.2 Build complex filter with all features active (BGM + Ducking + SFX + B-Roll + Subtitles)
const fullConfig = buildRenderComplexFilter({
  rawVideoPath: 'public/clips/test-input.mp4',
  relativeAssPath: 'public/clips/test-sub.ass',
  videoWidth: 1080,
  videoHeight: 1920,
  duration: 15.0,
  audioSettings: {
    bgmTrack: 'upbeat-energetic',
    bgmVolume: 0.35,
    duckingEnabled: true,
    duckingStrength: 'medium',
    sfxEnabled: true,
    sfxVolume: 0.75,
  },
  brollSettings: {
    enabled: true,
    theme: 'auto',
    overlays: [
      { id: 'b1', theme: 'finance', start: 1.0, end: 4.0, assetPath: '/assets/broll/finance.png' },
      { id: 'b2', theme: 'technology', start: 6.0, end: 9.0, assetPath: '/assets/broll/technology.png' },
    ],
  },
  segments: sampleSegments1,
});

console.log('Generated Multi-Stream Inputs count:', fullConfig.inputs.length);
console.log('Generated Complex Filtergraph preview:\n' + fullConfig.filterComplex);

// Check filtergraph structure
assert.ok(fullConfig.inputs.length >= 4, 'Must have at least 4 inputs (Video, B-Roll 1, B-Roll 2, BGM, SFX...)');
assert.ok(fullConfig.filterComplex.includes('sidechaincompress'), 'Filtergraph must include sidechaincompress for ducking');
assert.ok(fullConfig.filterComplex.includes('aloop=loop=-1:size=2205000'), 'Filtergraph must loop BGM audio with safe buffer size');
assert.ok(fullConfig.filterComplex.includes('aformat=channel_layouts=stereo:sample_rates=44100'), 'Filtergraph must format audio streams to stereo');
assert.ok(fullConfig.filterComplex.includes('amix=inputs='), 'Filtergraph must mix audio streams');
assert.ok(fullConfig.filterComplex.includes('subtitles=public/clips/test-sub.ass'), 'Filtergraph must burn subtitles');
assert.ok(fullConfig.filterComplex.includes('loop=loop=-1:size=1:start=0,fps=fps=25'), 'Filtergraph must loop static B-Roll image stream');
assert.ok(fullConfig.filterComplex.includes('overlay='), 'Filtergraph must include video overlay');
assert.ok(fullConfig.filterComplex.includes('fade=t=in:'), 'Filtergraph must include fade-in on B-Roll');
assert.ok(fullConfig.filterComplex.includes('fade=t=out:'), 'Filtergraph must include fade-out on B-Roll');
assert.ok(fullConfig.filterComplex.includes('adelay='), 'Filtergraph must include adelay for SFX');
assert.deepStrictEqual(fullConfig.outputMap, ['-map [vout]', '-map [aout]'], 'Must map [vout] and [aout]');
console.log('✓ Full multi-stream filtergraph verified successfully');

// 3.3 Test filter with Ducking disabled (BGM only master volume)
const noDuckingConfig = buildRenderComplexFilter({
  rawVideoPath: 'public/clips/test-input.mp4',
  relativeAssPath: 'public/clips/test-sub.ass',
  videoWidth: 1080,
  videoHeight: 1920,
  duration: 10.0,
  audioSettings: {
    bgmTrack: 'chill-lofi',
    bgmVolume: 0.25,
    duckingEnabled: false,
    sfxEnabled: false,
  },
  brollSettings: {
    enabled: false,
  },
  segments: [],
});

assert.ok(!noDuckingConfig.filterComplex.includes('sidechaincompress'), 'Filtergraph should not have sidechaincompress when ducking is disabled');
assert.ok(noDuckingConfig.filterComplex.includes('volume=0.25'), 'Filtergraph must apply specified BGM volume');
assert.ok(!noDuckingConfig.filterComplex.includes('adelay'), 'Filtergraph should not have SFX delay when SFX disabled');
console.log('✓ Non-ducking BGM audio filter verified');

// 3.4 Test minimal configuration (No BGM, No SFX, No B-Roll)
const minimalConfig = buildRenderComplexFilter({
  rawVideoPath: 'public/clips/test-input.mp4',
  relativeAssPath: 'public/clips/test-sub.ass',
  videoWidth: 1080,
  videoHeight: 1920,
  duration: 10.0,
  audioSettings: {
    bgmTrack: 'none',
    sfxEnabled: false,
  },
  brollSettings: {
    enabled: false,
  },
  segments: [],
});

assert.strictEqual(minimalConfig.inputs.length, 1, 'Minimal config should only have 1 input (main video)');
assert.ok(minimalConfig.filterComplex.includes('subtitles=public/clips/test-sub.ass[vout]'), 'Minimal config must burn subtitle to [vout]');
assert.ok(minimalConfig.filterComplex.includes('[main_a]anull[aout]'), 'Minimal config must pass audio straight through [main_a]anull[aout]');
console.log('✓ Minimal configuration verified\n');

console.log('🎉 ALL AUTO B-ROLL / SFX & BGM DUCKING TESTS PASSED SUCCESSFULLY!');
