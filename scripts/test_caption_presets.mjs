/**
 * Regression test for bundled caption style presets.
 * Verifies each preset in lib/captionPresets.js produces a valid ASS style
 * line carrying its font, color (ASS BGR order), and non-empty size.
 *
 * Run: node scripts/test_caption_presets.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CAPTION_PRESETS, getCaptionPreset } from '../lib/captionPresets.js';
import { generateAssSubtitleFile } from '../lib/subtitles.js';

console.log('🧪 Caption Preset Test Suite\n');

assert.ok(CAPTION_PRESETS.length >= 6, 'Expected at least 6 presets');
assert.ok(getCaptionPreset('beast'), 'beast preset should resolve');
assert.strictEqual(getCaptionPreset('nope'), null, 'unknown preset must resolve to null');

/** Convert #RRGGBB to ASS &H00BBGGRR& literal. */
const hexToAssColor = (hex) => {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2).toUpperCase();
  const g = h.slice(2, 4).toUpperCase();
  const b = h.slice(4, 6).toUpperCase();
  return `&H00${b}${g}${r}&`;
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-preset-'));

const segments = [
  {
    start: 0,
    end: 1.4,
    text: 'halo dunia',
    words: [
      { word: 'halo', start: 0, end: 0.6 },
      { word: 'dunia', start: 0.6, end: 1.4 },
    ],
  },
];

for (const preset of CAPTION_PRESETS) {
  const assPath = path.join(tmpDir, `${preset.id}.ass`);
  generateAssSubtitleFile({
    assPath,
    segments,
    style: preset.style,
    videoWidth: 608,
    videoHeight: 1080,
  });

  const ass = fs.readFileSync(assPath, 'utf-8');
  const styleLine = ass.split('\n').find((l) => l.startsWith('Style: Default'));
  assert.ok(styleLine, `[${preset.id}] missing Style: Default line`);
  assert.ok(styleLine.includes(preset.style.font), `[${preset.id}] font not applied`);
  assert.ok(
    styleLine.includes(hexToAssColor(preset.style.color)),
    `[${preset.id}] color not applied`
  );

  const fontSize = Number(styleLine.split(',')[2]);
  assert.ok(fontSize > 0, `[${preset.id}] invalid font size ${fontSize}`);

  const hasKaraokeTags = preset.style.animation === 'Karaoke' ? ass.includes('\\k') : true;
  assert.ok(hasKaraokeTags, `[${preset.id}] karaoke animation should emit \\k tags`);

  console.log(`✓ ${preset.emoji} ${preset.label} (${preset.style.font} ${fontSize}px, ${preset.style.animation})`);
  fs.unlinkSync(assPath);
}

fs.rmdirSync(tmpDir);
console.log('\n🎉 ALL CAPTION PRESET TESTS PASSED');