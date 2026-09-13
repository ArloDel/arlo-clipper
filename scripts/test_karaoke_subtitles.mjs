import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { formatKaraokeAssText, generateAssSubtitleFile } from '../lib/subtitles.js';

console.log('=== Running Karaoke Subtitles Test Suite ===\n');

// Test 1: formatKaraokeAssText with explicit word timestamps
{
  console.log('Test 1: formatKaraokeAssText with word-level timestamps');
  const segment = {
    id: 0,
    start: 1.0,
    end: 3.5,
    text: 'Halo teman-teman semua',
    words: [
      { word: 'Halo', start: 1.0, end: 1.5 },
      { word: 'teman-teman', start: 1.6, end: 2.5 },
      { word: 'semua', start: 2.6, end: 3.5 },
    ],
  };

  const result = formatKaraokeAssText(segment);
  console.log('Generated ASS Karaoke line:', result);

  assert.ok(result.includes('{\\k'), 'Result must include ASS karaoke tags');
  assert.ok(result.includes('Halo'), 'Result must contain word "Halo"');
  assert.ok(result.includes('teman-teman'), 'Result must contain word "teman-teman"');
  assert.ok(result.includes('semua'), 'Result must contain word "semua"');

  // Verify duration calculation:
  // Word 1: Halo (start 1.0, next 1.6 -> 0.6s = 60cs) -> {\k60}Halo
  // Word 2: teman-teman (start 1.6, next 2.6 -> 1.0s = 100cs) -> {\k100}teman-teman
  // Word 3: semua (start 2.6, next 3.5 -> 0.9s = 90cs) -> {\k90}semua
  assert.strictEqual(result, '{\\k60}Halo {\\k100}teman-teman {\\k90}semua');
  console.log('✓ Test 1 passed!\n');
}

// Test 2: formatKaraokeAssText with initial offset gap
{
  console.log('Test 2: formatKaraokeAssText with initial gap before first word');
  const segment = {
    id: 1,
    start: 2.0,
    end: 4.0,
    text: 'Viral shorts',
    words: [
      { word: 'Viral', start: 2.4, end: 3.0 },
      { word: 'shorts', start: 3.1, end: 4.0 },
    ],
  };

  const result = formatKaraokeAssText(segment);
  console.log('Generated ASS Karaoke line with initial gap:', result);

  // Initial gap: 2.4 - 2.0 = 0.4s = 40cs -> {\k40}
  // Word 1: Viral (2.4 to 3.1 = 0.7s = 70cs) -> {\k70}Viral
  // Word 2: shorts (3.1 to 4.0 = 0.9s = 90cs) -> {\k90}shorts
  assert.strictEqual(result, '{\\k40}{\\k70}Viral {\\k90}shorts');
  console.log('✓ Test 2 passed!\n');
}

// Test 3: formatKaraokeAssText fallback when words array is missing or empty
{
  console.log('Test 3: formatKaraokeAssText fallback on missing word timestamps');
  const segment = {
    id: 2,
    start: 0.0,
    end: 2.0,
    text: 'Satu dua tiga empat',
    words: [],
  };

  const result = formatKaraokeAssText(segment);
  console.log('Fallback generated ASS Karaoke line:', result);

  // 4 words across 2.0s = 0.5s per word = 50cs each
  assert.strictEqual(result, '{\\k50}Satu {\\k50}dua {\\k50}tiga {\\k50}empat');
  console.log('✓ Test 3 passed!\n');
}

// Test 4: generateAssSubtitleFile full file generation
{
  console.log('Test 4: generateAssSubtitleFile with Karaoke styling');
  const testAssPath = path.join(process.cwd(), 'test-karaoke-output.ass');

  const sampleSegments = [
    {
      id: 0,
      start: 0.5,
      end: 2.5,
      text: 'Selamat datang di Arlo Clipper',
      words: [
        { word: 'Selamat', start: 0.5, end: 0.9 },
        { word: 'datang', start: 0.9, end: 1.3 },
        { word: 'di', start: 1.3, end: 1.5 },
        { word: 'Arlo', start: 1.5, end: 1.9 },
        { word: 'Clipper', start: 1.9, end: 2.5 },
      ],
    },
  ];

  generateAssSubtitleFile({
    assPath: testAssPath,
    segments: sampleSegments,
    style: {
      font: 'Montserrat',
      size: 'Large',
      color: '#00FF66', // Neon green
      outline: true,
      shadow: true,
      animation: 'Karaoke',
    },
    videoWidth: 1080,
    videoHeight: 1920,
  });

  assert.ok(fs.existsSync(testAssPath), 'ASS file must be generated');
  const content = fs.readFileSync(testAssPath, 'utf-8');

  console.log('Generated ASS file preview:\n' + content);

  assert.ok(content.includes('[Script Info]'), 'Header [Script Info] must exist');
  assert.ok(content.includes('PlayResX: 1080'), 'PlayResX must be 1080');
  assert.ok(content.includes('PlayResY: 1920'), 'PlayResY must be 1920');
  assert.ok(content.includes('[V4+ Styles]'), 'Styles section must exist');
  assert.ok(content.includes('Montserrat'), 'Fontname must be Montserrat');
  assert.ok(content.includes('&H00FFFFFF&'), 'SecondaryColour must be &H00FFFFFF& (white base text)');
  assert.ok(content.includes('&H0066FF00&'), 'PrimaryColour must be &H0066FF00& (neon green)');
  assert.ok(content.includes('Dialogue: 0,0:00:00.50,0:00:02.50,Default,,0,0,0,,'), 'Dialogue timing must match');
  assert.ok(content.includes('{\\k'), 'Dialogue must contain karaoke tag');

  // Cleanup test file
  fs.unlinkSync(testAssPath);
  console.log('✓ Test 4 passed!\n');
}

// Test 5: Timestamp 0.0 value handling (testing zero-falsy edge cases)
{
  console.log('Test 5: Zero timestamp handling');
  const segment = {
    id: 3,
    start: 0,
    end: 1.0,
    text: 'Awal video',
    words: [
      { word: 'Awal', start: 0, end: 0.4 },
      { word: 'video', start: 0.4, end: 1.0 },
    ],
  };

  const result = formatKaraokeAssText(segment);
  console.log('Zero timestamp result:', result);
  // Initial gap must be 0 (no leading {\k0})
  assert.strictEqual(result, '{\\k40}Awal {\\k60}video');
  console.log('✓ Test 5 passed!\n');
}

// Test 6: ASS special character sanitization (braces & escape prevention)
{
  console.log('Test 6: ASS control character sanitization');
  const segment = {
    id: 4,
    start: 1.0,
    end: 2.0,
    text: 'Halo {world}',
    words: [
      { word: 'Halo', start: 1.0, end: 1.5 },
      { word: '{world}', start: 1.5, end: 2.0 },
    ],
  };

  const result = formatKaraokeAssText(segment);
  console.log('Sanitized result:', result);
  assert.strictEqual(result, '{\\k50}Halo {\\k50}world');
  console.log('✓ Test 6 passed!\n');
}

// Test 7: Empty and single-word segments
{
  console.log('Test 7: Empty and single-word segment edge cases');
  assert.strictEqual(formatKaraokeAssText(null), '');
  assert.strictEqual(formatKaraokeAssText({ start: 0, end: 1, text: '' }), '');
  
  const single = {
    id: 5,
    start: 0.5,
    end: 1.2,
    text: 'Halo',
    words: [{ word: 'Halo', start: 0.5, end: 1.2 }],
  };
  const singleResult = formatKaraokeAssText(single);
  assert.strictEqual(singleResult, '{\\k70}Halo');
  console.log('✓ Test 7 passed!\n');
}

console.log('🎉 ALL 7 KARAOKE SUBTITLE TESTS PASSED SUCCESSFULLY!');
